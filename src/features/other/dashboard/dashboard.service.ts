import prisma from "../../../config/prisma";
import { Prisma } from "../../../../generated/prisma/client";
import { AppError } from "../../../utils/AppError";
import OpenRouterAi from "../../../utils/openrouter_ai";
import {
  HospitalOverviewSystemPrompt,
  parseHospitalOverview,
  type HospitalOverview,
} from "../../../prompt/hospitalOverview";

/**
 * Returns dashboard summary counts scoped to a specific hospital.
 *
 * - totalPatients:   All unique patients that have at least one condition at this hospital
 * - activePatients:  Patients with at least one STABLE or CRITICAL condition at this hospital
 * - criticalAlerts:  Total number of CRITICAL conditions at this hospital
 * - highRiskPatients: Unique patients with at least one CRITICAL condition at this hospital
 */
export async function GetDashboardSummary(hospitalId: number) {
  const [totalPatients, activePatients, criticalAlerts, highRiskPatients] =
    await Promise.all([
      // Total unique patients linked to this hospital
      prisma.patient.count({
        where: {
          conditions: {
            some: {
              hospitalId,
            },
          },
        },
      }),

      // Active patients: at least one non-RECOVERED condition
      prisma.patient.count({
        where: {
          conditions: {
            some: {
              hospitalId,
              status: { in: ["STABLE", "CRITICAL"] },
            },
          },
        },
      }),

      // Critical alerts: count of CRITICAL conditions
      prisma.patientCondition.count({
        where: {
          hospitalId,
          status: "CRITICAL",
        },
      }),

      // High-risk patients: unique patients with at least one CRITICAL condition
      prisma.patient.count({
        where: {
          conditions: {
            some: {
              hospitalId,
              status: "CRITICAL",
            },
          },
        },
      }),
    ]);

  return {
    totalPatients,
    activePatients,
    criticalAlerts,
    highRiskPatients,
  };
}

export async function GetDashboardChartsData(hospitalId: number) {
  const [activeConditionsRaw, complianceRaw, diseaseCountsRaw, followUpStatusesRaw, recoveryProgressRaw] =
    await Promise.all([
      // 1. Active Conditions (Pie)
      prisma.patientCondition.groupBy({
        by: ['status'],
        where: { hospitalId },
        _count: { id: true }
      }),

      // 2. Medication Adherence (Radial)
      prisma.medicineStatus.groupBy({
        by: ['medicineTaken'],
        where: {
          medicineAlloted: {
            some: {
              patientCondition: { hospitalId }
            }
          }
        },
        _count: { id: true }
      }),

      // 3. Top Diseases (Bar)
      prisma.disease.findMany({
        where: {
          patientConditions: {
            some: { hospitalId }
          }
        },
        select: {
          id: true,
          name: true,
          _count: {
            select: {
              patientConditions: {
                where: { hospitalId }
              }
            }
          }
        }
      }),

      // 4. Follow-up Statuses (Donut)
      prisma.patientProgress.groupBy({
        by: ['followUpStatus'],
        where: {
          patientCondition: { hospitalId }
        },
        _count: { id: true }
      }),

      // 5. Patient Recovery Progress over Time (Line)
      prisma.patientProgress.findMany({
        where: {
          patientCondition: { hospitalId },
          percentageRecovery: { not: null }
        },
        select: {
          scheduledDate: true,
          percentageRecovery: true
        },
        orderBy: {
          scheduledDate: 'asc'
        }
      })
    ]);

  // Formatter for Active Conditions
  const activeConditions = {
    stable: activeConditionsRaw.find(c => c.status === "STABLE")?._count.id || 0,
    critical: activeConditionsRaw.find(c => c.status === "CRITICAL")?._count.id || 0,
    recovered: activeConditionsRaw.find(c => c.status === "RECOVERED")?._count.id || 0,
  };

  // Formatter for Medication Adherence
  const taken = complianceRaw.find(c => c.medicineTaken === true)?._count.id || 0;
  const missed = complianceRaw.find(c => c.medicineTaken === false)?._count.id || 0;
  const totalMedication = taken + missed;
  const medicationAdherence = {
    taken,
    missed,
    complianceRate: totalMedication > 0 ? Math.round((taken / totalMedication) * 100) : 0,
  };

  // Formatter for Top Diseases
  const topDiseases = diseaseCountsRaw
    .map(d => ({
      disease: d.name,
      count: d._count.patientConditions
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Formatter for Follow-up Statuses
  const followUpStatuses = followUpStatusesRaw.map(f => ({
    status: f.followUpStatus,
    count: f._count.id
  }));

  // Formatter for Patient Recovery Progress Over Time (grouped daily)
  const dailyMap: { [date: string]: { sum: number; count: number } } = {};
  for (const progress of recoveryProgressRaw) {
    const dateStr = progress.scheduledDate.toISOString().split('T')[0];
    if (!dateStr) continue;
    if (!dailyMap[dateStr]) {
      dailyMap[dateStr] = { sum: 0, count: 0 };
    }
    dailyMap[dateStr].sum += progress.percentageRecovery ?? 0;
    dailyMap[dateStr].count += 1;
  }
  const recoveryTrend = Object.entries(dailyMap)
    .map(([date, data]) => ({
      date,
      averageRecovery: Math.round((data.sum / data.count) * 100) / 100
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    activeConditions,
    medicationAdherence,
    topDiseases,
    followUpStatuses,
    recoveryTrend,
  };
}

export async function SeedRecoveryTrendForHospital(hospitalId: number) {
  const conditions = await prisma.patientCondition.findMany({
    where: { hospitalId },
    select: { id: true }
  });

  if (conditions.length === 0) {
    throw new AppError("No patient conditions found for this hospital. Please seed patients and conditions first.", 400);
  }

  const today = new Date();
  const targetConditions = conditions.slice(0, 3);
  let seededCount = 0;

  for (const condition of targetConditions) {
    // Clear any existing progress records with percentageRecovery to avoid duplicates
    await prisma.patientProgress.deleteMany({
      where: {
        patientConditionId: condition.id,
        percentageRecovery: { not: null }
      }
    });

    // Generate 5 days of recovery data leading up to today
    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setDate(today.getDate() - i);
      date.setHours(9, 0, 0, 0); // Keep timestamps uniform

      // Calculate realistic recovery percentage
      let recoveryPercent = 0;
      if (condition.id % 3 === 0) {
        recoveryPercent = Math.max(10, 100 - (i * 16));
      } else if (condition.id % 3 === 1) {
        recoveryPercent = Math.max(10, 90 - (i * 14));
      } else {
        recoveryPercent = Math.max(10, 95 - (i * 15));
      }

      await prisma.patientProgress.create({
        data: {
          patientConditionId: condition.id,
          scheduledDate: date,
          percentageRecovery: recoveryPercent,
          followUpStatus: "SUCCESSFUL",
          createdAt: date, // Overrides default to work on older and newer code
          questions: [{ question: "Recovery status check", isText: true }],
          answer: [{ question: "Recovery status check", answer: "Condition has significantly improved." }]
        }
      });
      seededCount++;
    }
  }

  return seededCount;
}

// The stored/served overview shape: the validated AI summary plus the underlying
// counts, and (when read back from the DB) when it was last generated.
export type HospitalAiOverviewResult = HospitalOverview & {
  stats: Awaited<ReturnType<typeof GetDashboardSummary>>;
};

/**
 * Builds an AI-generated operational overview of a hospital's entire patient
 * population by calling the model live. Feeds aggregate, de-identified statistics
 * (never raw patient records) to the model and returns a validated, structured
 * summary plus the underlying counts for the UI.
 *
 * This is the expensive primitive: it makes an OpenRouter call. The dashboard
 * does NOT call this on every request — the daily cron generates and stores the
 * result (see GenerateAllHospitalAiOverviews) and the dashboard reads the cached
 * copy via GetStoredHospitalAiOverview.
 */
export async function ComputeHospitalAiOverview(
  hospitalId: number
): Promise<HospitalAiOverviewResult> {
  const [hospital, summary, charts, criticalConditions] = await Promise.all([
    prisma.hospital.findUnique({
      where: { id: hospitalId },
      select: { name: true },
    }),
    GetDashboardSummary(hospitalId),
    GetDashboardChartsData(hospitalId),
    // Open CRITICAL conditions — disease only, no patient identifiers, so the
    // model gets concrete clinical context without receiving PII.
    prisma.patientCondition.findMany({
      where: { hospitalId, status: "CRITICAL" },
      select: {
        startDate: true,
        disease: { select: { name: true, type: true } },
      },
      orderBy: { startDate: "asc" },
      take: 200,
    }),
  ]);

  // Aggregate the critical conditions by disease. Iterating in startDate-asc
  // order means the first time we see a disease is its oldest critical case.
  const criticalMap = new Map<
    string,
    { disease: string; type: string | null; count: number; oldestCriticalSince: string }
  >();
  for (const c of criticalConditions) {
    const name = c.disease?.name ?? "Unknown";
    const existing = criticalMap.get(name);
    if (existing) {
      existing.count += 1;
    } else {
      criticalMap.set(name, {
        disease: name,
        type: c.disease?.type ?? null,
        count: 1,
        oldestCriticalSince: c.startDate ? c.startDate.toISOString() : "",
      });
    }
  }
  const criticalByDisease = Array.from(criticalMap.values()).sort(
    (a, b) => b.count - a.count
  );

  const payload = {
    hospitalName: hospital?.name ?? "This hospital",
    patientCounts: summary,
    activeConditions: charts.activeConditions,
    medicationAdherence: charts.medicationAdherence,
    topDiseases: charts.topDiseases,
    followUpStatuses: charts.followUpStatuses,
    recoveryTrend: charts.recoveryTrend.slice(-10),
    criticalByDisease,
  };

  const raw = await OpenRouterAi({
    SystemPrompt: HospitalOverviewSystemPrompt,
    Prompt: `Hospital Patient Population Data: ${JSON.stringify(payload)}`,
  });

  return {
    ...parseHospitalOverview(raw),
    // Echo the counts so the card can show them alongside the AI narrative.
    stats: summary,
  };
}

// The shape returned to the dashboard: the cached overview plus when it was made.
export type StoredHospitalAiOverview = HospitalAiOverviewResult & {
  generatedAt: Date;
};

/**
 * Generates a fresh AI overview for one hospital (an OpenRouter call) and stores
 * it as the hospital's single cached overview row, replacing any previous one.
 * Returns the stored overview including its generation timestamp.
 */
export async function GenerateAndStoreHospitalAiOverview(
  hospitalId: number
): Promise<StoredHospitalAiOverview> {
  const overview = await ComputeHospitalAiOverview(hospitalId);

  // UNKNOWN means the model's answer couldn't be parsed into the schema (e.g. a
  // malformed/truncated response). Never overwrite a good cached briefing with
  // that — throw so the cron logs a failure and yesterday's copy keeps serving.
  if (overview.status === "UNKNOWN") {
    throw new AppError(
      `AI returned an unparseable overview for hospital ${hospitalId}; keeping the previous cached copy`,
      502
    );
  }

  const generatedAt = new Date();
  // Prisma's Json input type wants a structural JSON value; our typed overview is
  // plain JSON-serialisable data, so this cast is safe.
  const data = overview as unknown as Prisma.InputJsonValue;

  // One row per hospital (hospitalId is unique) — upsert so each run replaces the
  // previous briefing in place. The Json column stores the whole overview object.
  const row = await prisma.hospitalAiOverview.upsert({
    where: { hospitalId },
    create: { hospitalId, data, generatedAt },
    update: { data, generatedAt },
  });

  return { ...overview, generatedAt: row.generatedAt };
}

/**
 * Regenerates the cached AI overview for EVERY hospital. Intended to be run by a
 * daily cron. Hospitals are processed sequentially so we don't fire a burst of
 * concurrent model calls; one hospital failing (e.g. a transient AI error) never
 * aborts the rest. Returns a small summary for logging.
 */
export async function GenerateAllHospitalAiOverviews(): Promise<{
  total: number;
  succeeded: number;
  failed: number;
}> {
  const hospitals = await prisma.hospital.findMany({ select: { id: true, name: true } });

  let succeeded = 0;
  let failed = 0;

  // Up to 3 attempts per hospital: back-to-back calls regularly trip transient
  // upstream rate limits (OpenRouter 429s mid-batch), which a short wait clears.
  const MAX_ATTEMPTS = 3;
  const RETRY_DELAY_MS = 10_000;

  for (const hospital of hospitals) {
    for (let attempt = 1; ; attempt++) {
      try {
        await GenerateAndStoreHospitalAiOverview(hospital.id);
        succeeded++;
        break;
      } catch (error) {
        if (attempt >= MAX_ATTEMPTS) {
          failed++;
          console.error(
            `[ai-overview] Failed for hospital ${hospital.id} (${hospital.name}) after ${attempt} attempts:`,
            error
          );
          break;
        }
        console.warn(
          `[ai-overview] Attempt ${attempt} failed for hospital ${hospital.id} (${hospital.name}), retrying in ${RETRY_DELAY_MS / 1000}s…`
        );
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }

  return { total: hospitals.length, succeeded, failed };
}

/**
 * Reads the cached AI overview for a hospital from the DB (what the dashboard
 * serves). This NEVER calls the model — requests must not burn tokens. If no
 * cached row exists yet (hospital created after the last run, or the cron has
 * never run), returns null and the caller reports "not generated yet"; the next
 * daily run (or a manual trigger of the generate endpoint) fills it in.
 */
export async function GetStoredHospitalAiOverview(
  hospitalId: number
): Promise<StoredHospitalAiOverview | null> {
  const row = await prisma.hospitalAiOverview.findUnique({ where: { hospitalId } });

  if (!row) return null;

  // The Json column round-trips as the overview object we stored.
  return {
    ...(row.data as unknown as HospitalAiOverviewResult),
    generatedAt: row.generatedAt,
  };
}


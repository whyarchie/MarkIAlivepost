import prisma from "../../../config/prisma";
import { AppError } from "../../../utils/AppError";

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



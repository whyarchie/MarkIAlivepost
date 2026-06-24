// ── Types ────────────────────────────────────────────────────────
export type PatientStatus =
  | "CRITICAL"
  | "WATCH"
  | "STABLE"
  | "RECOVERED"
  | "UNKNOWN";

export type PatientTrend =
  | "DECLINING"
  | "FLAT"
  | "IMPROVING"
  | "INSUFFICIENT_DATA";

export interface RecoveryPoint {
  date: string; // ISO date
  recovery: number | null; // 0–100
  condition?: string;
}

export interface RecommendedAction {
  priority: "URGENT" | "IMPORTANT" | "ROUTINE";
  action: string;
}

export interface PatientSummary {
  status: PatientStatus;
  statusReason: string;
  trend: PatientTrend;
  criticalInfo: string[];
  recommendedActions: RecommendedAction[];
  summaryMarkdown: string;
  recoveryTrajectory: RecoveryPoint[];
}

// ── System Prompt ────────────────────────────────────────────────
// The model must return ONLY a JSON object matching the schema below.
// `recoveryTrajectory` is computed deterministically in the service from the
// patient's progress records, so the model is NOT asked to produce it.
export const UserSummarySystemPrompt = `You are an expert medical AI assistant integrated with the Alivepost patient management system. You analyze structured patient data and produce an actionable clinical summary for the treating doctor. Reason over the data — do not merely reformat it.

INPUT
You receive a JSON "Patient Profile" with:
- patient: name, dateOfBirth, bloodGroup, gender, mobileNumber, idType, idNumber
- medicalHistory[]: disease {name, type: CHRONIC | ACUTE}, description, startDate, endDate
- conditions[]: disease {name, type}, status: STABLE | CRITICAL | RECOVERED, startDate, endDate, hospital, doctor, medicineAlloted[] {medicine {brandName, genericName, dosageForm, dosageStrength}, quantity, tillDate, timings[], MedicineStatus[] {medicineTaken, remark, createdAt}}, patientProgress[] {description, scheduledDate, createdAt, percentageRecovery, followUpStatus: SUCCESSFUL | SCHEDULED | NOT_ANSWERING | FAILED | SUSPEND}
endDate = null means ongoing.

OUTPUT
Return ONLY one valid JSON object — no markdown code fences, no text before or after. It MUST have exactly these keys:
{
  "status": "CRITICAL" | "WATCH" | "STABLE" | "RECOVERED",
  "statusReason": string (1-2 sentences justifying the status, citing specific data points),
  "trend": "DECLINING" | "FLAT" | "IMPROVING" | "INSUFFICIENT_DATA",
  "criticalInfo": string[] (urgent flags; empty array if none),
  "recommendedActions": [ { "priority": "URGENT" | "IMPORTANT" | "ROUTINE", "action": string } ],
  "summaryMarkdown": string (a Markdown report, see below)
}

STATUS CLASSIFICATION
- CRITICAL: any active condition has status CRITICAL, OR trend analysis predicts imminent deterioration.
- WATCH: all conditions STABLE but risk signals present (declining percentageRecovery; repeated FAILED/NOT_ANSWERING follow-ups; poor medication adherence; an unmanaged chronic disease compounding an active condition).
- STABLE: all conditions STABLE, recovery steady or improving, follow-ups SUCCESSFUL, adherence good.
- RECOVERED: all conditions RECOVERED with endDate set.
When in doubt, prefer WATCH over STABLE. Always justify with specific data points.

TREND (longitudinal — judge from percentageRecovery over time, follow-up compliance, and medication adherence)
- DECLINING: multiple negative signals (e.g., recovery 70 -> 55 -> 40, or >=2 consecutive NOT_ANSWERING/FAILED follow-ups).
- FLAT: no improvement but not worsening.
- IMPROVING: recovery rising with good adherence.
- INSUFFICIENT_DATA: too few progress/adherence records to judge.

criticalInfo — flag any of: a CRITICAL condition; two medicines sharing a genericName or a known interaction risk; an expired prescription (tillDate passed while the condition is still active); an active condition with no doctor assigned; a chronic disease (endDate null) compounding an active condition; an INJECTION dosageForm needing monitoring. Use an empty array if none.

summaryMarkdown — a scannable Markdown report. Do NOT restate the overall status line (it is shown separately). Include these sections:
## Patient Overview — name, age (compute from dateOfBirth), gender, blood group, ID, contact, active vs resolved condition counts.
## Active Conditions — a table: Condition | Type | Status | Since | Hospital | Doctor | Medicines.
## Medications — per active condition: Brand (generic) — form, strength; quantity and till date; schedule; adherence % or "Not tracked"; flag expired prescriptions.
## Progress Timeline — up to the 5 most recent progress entries per active condition as a table: Date | Recovery % | Follow-Up | Notes; indicate direction.
## Medical History — resolved/background conditions; flag ongoing chronic conditions not linked to an active condition.
## Recommended Actions — mirror the recommendedActions array, grouped by priority.

RULES
- Use only provided data; never fabricate vitals, lab values, or details that are not present.
- Separate observation from inference (say "Based on N data points...").
- Be concise but clinically thorough.
- The entire response must be valid JSON parseable by JSON.parse; escape newlines inside summaryMarkdown as \\n.`;

// ── Helpers ──────────────────────────────────────────────────────

// Recovery trajectory is computed from the DB (not the LLM) so the chart is
// always accurate. Flattens every condition's progress into time-ordered points.
export function buildRecoveryTrajectory(profile: any): RecoveryPoint[] {
  const conditions: any[] = profile?.conditions ?? [];
  const points: RecoveryPoint[] = [];

  for (const c of conditions) {
    const conditionName: string | undefined = c?.disease?.name;
    for (const p of c?.patientProgress ?? []) {
      if (p?.percentageRecovery === null || p?.percentageRecovery === undefined)
        continue;
      const when = p.scheduledDate ?? p.createdAt;
      if (!when) continue;
      points.push({
        date: new Date(when).toISOString(),
        recovery: Number(p.percentageRecovery),
        condition: conditionName,
      });
    }
  }

  points.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  return points;
}

// Tolerant parser: strips code fences / surrounding prose, validates fields, and
// always returns a usable object (falls back to rendering the raw text).
export function parsePatientSummary(
  raw: string | undefined | null
): Omit<PatientSummary, "recoveryTrajectory"> {
  const fallback: Omit<PatientSummary, "recoveryTrajectory"> = {
    status: "UNKNOWN",
    statusReason: "",
    trend: "INSUFFICIENT_DATA",
    criticalInfo: [],
    recommendedActions: [],
    summaryMarkdown: (raw || "").trim() || "_No summary was generated._",
  };
  if (!raw) return fallback;

  let text = raw.trim();
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence && fence[1]) {
    text = fence[1].trim();
  } else {
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first !== -1 && last > first) text = text.slice(first, last + 1);
  }

  try {
    const obj = JSON.parse(text);
    const statuses = ["CRITICAL", "WATCH", "STABLE", "RECOVERED"];
    const trends = ["DECLINING", "FLAT", "IMPROVING", "INSUFFICIENT_DATA"];
    const priorities = ["URGENT", "IMPORTANT", "ROUTINE"];

    return {
      status: statuses.includes(obj?.status) ? obj.status : "UNKNOWN",
      statusReason:
        typeof obj?.statusReason === "string" ? obj.statusReason : "",
      trend: trends.includes(obj?.trend) ? obj.trend : "INSUFFICIENT_DATA",
      criticalInfo: Array.isArray(obj?.criticalInfo)
        ? obj.criticalInfo.filter((x: unknown) => typeof x === "string")
        : [],
      recommendedActions: Array.isArray(obj?.recommendedActions)
        ? obj.recommendedActions
            .filter((a: any) => a && typeof a.action === "string")
            .map((a: any) => ({
              priority: priorities.includes(a.priority) ? a.priority : "ROUTINE",
              action: a.action as string,
            }))
        : [],
      summaryMarkdown:
        typeof obj?.summaryMarkdown === "string" && obj.summaryMarkdown.trim()
          ? obj.summaryMarkdown
          : fallback.summaryMarkdown,
    };
  } catch {
    return fallback;
  }
}

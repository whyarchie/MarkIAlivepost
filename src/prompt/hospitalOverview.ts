// ── Types ────────────────────────────────────────────────────────
// Population-level status for a hospital's whole patient panel.
export type PopulationStatus =
  | "CRITICAL"
  | "NEEDS_ATTENTION"
  | "STABLE"
  | "HEALTHY"
  | "UNKNOWN";

export interface HospitalOverviewAction {
  priority: "URGENT" | "IMPORTANT" | "ROUTINE";
  action: string;
}

export interface HospitalOverview {
  status: PopulationStatus;
  headline: string;
  keyInsights: string[];
  concerns: string[];
  recommendedActions: HospitalOverviewAction[];
  summaryMarkdown: string;
}

// ── System Prompt ────────────────────────────────────────────────
// The model receives aggregate, PII-free statistics about a hospital's entire
// patient population and returns ONLY a JSON object matching the schema below.
export const HospitalOverviewSystemPrompt = `You are an operational analytics AI for the Alivepost hospital management system. You are given aggregate, de-identified statistics describing a single hospital's ENTIRE registered patient population. Produce a concise, actionable operational briefing for the hospital's care coordinators and administrators. Reason over the numbers — surface what matters, do not merely restate the input.

INPUT
You receive a JSON object "Hospital Patient Population Data" with:
- hospitalName: string
- patientCounts: { totalPatients, activePatients, criticalAlerts, highRiskPatients }
- activeConditions: { stable, critical, recovered }  (counts of patient conditions by status)
- medicationAdherence: { taken, missed, complianceRate }  (complianceRate is 0-100)
- topDiseases: [{ disease, count }]  (most common diagnoses)
- followUpStatuses: [{ status, count }]  (SUCCESSFUL | SCHEDULED | NOT_ANSWERING | FAILED | SUSPEND)
- recoveryTrend: [{ date, averageRecovery }]  (population average recovery % over recent dates)
- criticalByDisease: [{ disease, type, count, oldestCriticalSince }]  (open CRITICAL conditions grouped by disease)

OUTPUT
Return ONLY one valid JSON object — no markdown code fences, no text before or after. It MUST have exactly these keys:
{
  "status": "CRITICAL" | "NEEDS_ATTENTION" | "STABLE" | "HEALTHY",
  "headline": string (one sentence, <= 140 chars, summarizing the population's health at a glance),
  "keyInsights": string[] (3-5 data-grounded observations, each citing specific numbers),
  "concerns": string[] (operational risks needing attention; empty array if none),
  "recommendedActions": [ { "priority": "URGENT" | "IMPORTANT" | "ROUTINE", "action": string } ],
  "summaryMarkdown": string (a short Markdown briefing, see below)
}

STATUS CLASSIFICATION (about the whole population, not one patient)
- CRITICAL: a meaningful share of patients are high-risk/critical, or the recovery trend is clearly declining, or adherence is poor with many failed follow-ups.
- NEEDS_ATTENTION: some critical patients or risk signals (declining recovery, missed medications, NOT_ANSWERING/FAILED follow-ups) that warrant follow-up.
- STABLE: most patients stable, adherence acceptable, recovery flat-to-improving, few criticals.
- HEALTHY: strong adherence, improving recovery, minimal criticals.
When counts are all zero or there is essentially no data, still pick the closest status and say so in the headline.

RULES
- Use only the provided aggregates; never invent patient names, vitals, or numbers not present.
- Quantify insights ("42% medication compliance across 120 doses", "8 patients critical, 5 of them with Dengue").
- keyInsights and recommendedActions must be specific and immediately useful to a coordinator.
- summaryMarkdown: a scannable briefing with these sections (omit a section if there is no data for it):
## Population Snapshot — totals, active vs recovered, critical/high-risk counts.
## Medication Adherence — compliance rate and what it implies.
## Critical & High-Risk — which diseases drive the criticals; note any long-standing critical conditions.
## Recovery Trend — direction of the average recovery line.
## Recommended Focus — mirror recommendedActions, grouped by priority.
- The entire response must be valid JSON parseable by JSON.parse; escape newlines inside summaryMarkdown as \\n.`;

// ── Parser ───────────────────────────────────────────────────────
// Tolerant parser: strips code fences / surrounding prose, validates fields, and
// always returns a usable object (falls back to rendering the raw text).
export function parseHospitalOverview(
  raw: string | undefined | null
): HospitalOverview {
  const fallback: HospitalOverview = {
    status: "UNKNOWN",
    headline: "",
    keyInsights: [],
    concerns: [],
    recommendedActions: [],
    summaryMarkdown: (raw || "").trim() || "_No overview was generated._",
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
    const statuses = ["CRITICAL", "NEEDS_ATTENTION", "STABLE", "HEALTHY"];
    const priorities = ["URGENT", "IMPORTANT", "ROUTINE"];
    const strList = (v: unknown) =>
      Array.isArray(v) ? v.filter((x: unknown): x is string => typeof x === "string") : [];

    return {
      status: statuses.includes(obj?.status) ? obj.status : "UNKNOWN",
      headline: typeof obj?.headline === "string" ? obj.headline : "",
      keyInsights: strList(obj?.keyInsights),
      concerns: strList(obj?.concerns),
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

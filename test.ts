import { GenerateAllHospitalAiOverviews } from "./src/features/other/dashboard/dashboard.service.ts";

async function test() {
  try {
    console.log("[ai-overview] Starting daily hospital AI overview generation…");

    const result = await GenerateAllHospitalAiOverviews();

    console.log(
      `[ai-overview] Done: ${result.succeeded}/${result.total} hospitals updated` +
      (result.failed ? `, ${result.failed} failed` : "")
    );
  } catch (error) {
    console.error("[ai-overview] Daily generation cron failed:", error);
  }
}

test();

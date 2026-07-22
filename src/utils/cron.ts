import cron from "node-cron";
import prisma from "../config/prisma";
import { AppError } from "./AppError";
import { PushNotification } from "./fcm";
import { GenerateAllHospitalAiOverviews } from "../features/other/dashboard/dashboard.service";

// Optional timezone for all scheduled jobs (e.g. "Asia/Kolkata"). Defaults to the
// server's local time when unset. node-cron interprets the cron expression in it.
const CRON_TIMEZONE = process.env.CRON_TIMEZONE || undefined;
const cronOptions = CRON_TIMEZONE ? { timezone: CRON_TIMEZONE } : undefined;

cron.schedule("0 6 * * *", async () => {
    try {
        const now = new Date()
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        const pending = await prisma.patientProgress.findMany({
            where: {
                scheduledDate: {
                    gte: startOfDay,
                    lte: endOfDay,
                },
            },
            include: {
                patientCondition: {
                    include: {
                        patient: {
                            include: {
                                patientDevices: true,
                            },
                        },
                    },
                },
            },
        })

        console.log("Today's scheduled follow-ups:", pending.length);

        for (const item of pending) {
            const devices = item.patientCondition.patient.patientDevices;

            if (!devices.length) continue;

            for (const device of devices) {
                // call your push notification here
                await PushNotification({ fcmToken: "c6OwwII5QxWWwCOwrFkRUJ:APA91bGPXySga0ffViIV2CHDJuvQC9N7TTvUcTVaHkhepQCy_bcoEBM7ST3hV5FPUfPcOg8Prpze45yvNh-ucD1F0UgTQ-MJQU72IWAoGP1_oUSX1exQWBk", title: "Follow Up", body: "It's time for your follow-up" }, {
                    type: "regular_update",
                    id: item.id,
                });
                console.log(`Send notification to device ${device.id}`);
            }

            // optional: update status so it doesn't resend
            await prisma.patientProgress.update({
                where: { id: item.id },
                data: {
                    followUpStatus: "SUCCESSFUL", // or keep scheduled depending on logic
                },
            });
        }
    } catch (error) {
        console.error('Cron job failed:', error);
    }
})

// ── Daily AI patient-overview generation ─────────────────────────────────────
// Every day at 7:00 AM, regenerate the AI patient overview for every hospital and
// store it in the DB. The dashboard reads the stored copy, so hospitals get an
// up-to-date briefing without an (expensive) live model call on each page load.
// Override the schedule with AI_OVERVIEW_CRON if needed (defaults to 7:00 AM).
const AI_OVERVIEW_CRON = process.env.AI_OVERVIEW_CRON || "0 7 * * *";

cron.schedule(AI_OVERVIEW_CRON, async () => {
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
}, cronOptions)
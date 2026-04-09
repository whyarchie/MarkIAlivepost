import cron from "node-cron";
import prisma from "../config/prisma";
import { AppError } from "./AppError";
import { PushNotification } from "./fcm";

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
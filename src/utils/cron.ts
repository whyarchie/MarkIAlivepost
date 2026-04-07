import cron from "node-cron";
import prisma from "../config/prisma";
import { AppError } from "./AppError";
cron.schedule("* * * * *", async ()=>{
    try{

        const now = new Date()
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);
        const pending = await prisma.patientProgress.findMany({
            where:{
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
    }catch(error){
            throw new AppError('Cron error', 500)
    }
})
import prisma from "./config/prisma";

async function main() {
  console.log("=== Checking database PatientProgress records ===");
  try {
    const records = await prisma.patientProgress.findMany({
      where: {
        patientCondition: { hospitalId: 1 },
        percentageRecovery: { not: null }
      },
      select: {
        id: true,
        patientConditionId: true,
        scheduledDate: true,
        createdAt: true,
        percentageRecovery: true,
        patientCondition: {
          select: {
            hospitalId: true
          }
        }
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    console.log(`Found ${records.length} records with percentageRecovery not null:`);
    for (const r of records) {
      console.log(`ID: ${r.id}, Condition ID: ${r.patientConditionId}, Hospital: ${r.patientCondition.hospitalId}, Scheduled: ${r.scheduledDate.toISOString()}, CreatedAt: ${r.createdAt.toISOString()}, %: ${r.percentageRecovery}`);
    }
  } catch (error) {
    console.error("Query failed:", error);
  }
}

main();

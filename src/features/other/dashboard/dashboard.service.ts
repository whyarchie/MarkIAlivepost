import prisma from "../../../config/prisma";

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

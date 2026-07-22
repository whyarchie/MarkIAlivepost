import express from "express";
import { AuthUser } from "../../../middleware/Auth";
import { AppError } from "../../../utils/AppError";
import { COMMON_ERROR } from "../../../constants/messages";
import { GetDashboardSummary, GetDashboardChartsData, GetStoredHospitalAiOverview } from "./dashboard.service";

const dashboardRouter = express.Router();

/**
 * @swagger
 * /api/v1/dashboard/summaryCard:
 *   get:
 *     summary: Get dashboard summary counts (Hospital auth required)
 *     tags: [Dashboard]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Dashboard summary counts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalPatients:
 *                       type: integer
 *                       description: Total patients linked to this hospital
 *                     activePatients:
 *                       type: integer
 *                       description: Patients with at least one active (STABLE/CRITICAL) condition
 *                     criticalAlerts:
 *                       type: integer
 *                       description: Total number of CRITICAL conditions
 *                     highRiskPatients:
 *                       type: integer
 *                       description: Patients with at least one CRITICAL condition
 *       401:
 *         description: Unauthorized — no token provided
 *       403:
 *         description: Forbidden — only hospitals can access this
 */
dashboardRouter.get("/summaryCard", AuthUser, async (req, res, next) => {
  try {
    const user = req.user;
    if (user?.role !== "Hospital") {
      throw new AppError(COMMON_ERROR.INVALID_ROLE, 403);
    }

    const summary = await GetDashboardSummary(user.id);

    res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/dashboard/charts:
 *   get:
 *     summary: Get dashboard charts and analytics data (Hospital auth required)
 *     tags: [Dashboard]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Dashboard charts and analytics data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     activeConditions:
 *                       type: object
 *                       properties:
 *                         stable:
 *                           type: integer
 *                         critical:
 *                           type: integer
 *                         recovered:
 *                           type: integer
 *                     medicationAdherence:
 *                       type: object
 *                       properties:
 *                         taken:
 *                           type: integer
 *                         missed:
 *                           type: integer
 *                         complianceRate:
 *                           type: integer
 *                           description: Percentage compliance rate (0-100)
 *                     topDiseases:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           disease:
 *                             type: string
 *                           count:
 *                             type: integer
 *                     followUpStatuses:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           status:
 *                             type: string
 *                           count:
 *                             type: integer
 *                     recoveryTrend:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           date:
 *                             type: string
 *                             format: date
 *                           averageRecovery:
 *                             type: number
 *       401:
 *         description: Unauthorized — no token provided
 *       403:
 *         description: Forbidden — only hospitals can access this
 */
dashboardRouter.get("/charts", AuthUser, async (req, res, next) => {
  try {
    const user = req.user;
    if (user?.role !== "Hospital") {
      throw new AppError(COMMON_ERROR.INVALID_ROLE, 403);
    }

    const chartsData = await GetDashboardChartsData(user.id);

    res.status(200).json({
      success: true,
      data: chartsData,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/dashboard/ai-overview:
 *   get:
 *     summary: AI-generated overview of the hospital's whole patient population (Hospital auth required)
 *     tags: [Dashboard]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Structured AI overview plus underlying counts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       enum: [CRITICAL, NEEDS_ATTENTION, STABLE, HEALTHY, UNKNOWN]
 *                     headline:
 *                       type: string
 *                     keyInsights:
 *                       type: array
 *                       items: { type: string }
 *                     concerns:
 *                       type: array
 *                       items: { type: string }
 *                     recommendedActions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           priority: { type: string, enum: [URGENT, IMPORTANT, ROUTINE] }
 *                           action: { type: string }
 *                     summaryMarkdown:
 *                       type: string
 *                     stats:
 *                       type: object
 *                     generatedAt:
 *                       type: string
 *                       format: date-time
 *                       description: When this cached overview was last generated by the daily cron
 *       401:
 *         description: Unauthorized — no token provided
 *       403:
 *         description: Forbidden — only hospitals can access this
 */
dashboardRouter.get("/ai-overview", AuthUser, async (req, res, next) => {
  try {
    const user = req.user;
    if (user?.role !== "Hospital") {
      throw new AppError(COMMON_ERROR.INVALID_ROLE, 403);
    }

    // Served from the DB — regenerated daily by the 7 AM cron
    // (GenerateAllHospitalAiOverviews). Lazily generated on first-ever read.
    const overview = await GetStoredHospitalAiOverview(user.id);

    res.status(200).json({
      success: true,
      data: overview,
    });
  } catch (error) {
    next(error);
  }
});

export default dashboardRouter;


import express from "express";
import { AuthUser } from "../../../middleware/Auth";
import { AppError } from "../../../utils/AppError";
import { COMMON_ERROR } from "../../../constants/messages";
import { GetDashboardSummary, GetDashboardChartsData, GetStoredHospitalAiOverview, GenerateAllHospitalAiOverviews } from "./dashboard.service";

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
 *       404:
 *         description: No overview generated yet — created by the next daily run
 */
dashboardRouter.get("/ai-overview", AuthUser, async (req, res, next) => {
  try {
    const user = req.user;
    if (user?.role !== "Hospital") {
      throw new AppError(COMMON_ERROR.INVALID_ROLE, 403);
    }

    // Served purely from the DB — this route never calls the model. The cached
    // copy is regenerated daily by the 7 AM cron (GenerateAllHospitalAiOverviews)
    // or a manual POST /ai-overview/generate.
    const overview = await GetStoredHospitalAiOverview(user.id);

    if (!overview) {
      throw new AppError(
        "AI overview has not been generated yet — it is created automatically every morning.",
        404
      );
    }

    res.status(200).json({
      success: true,
      data: overview,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/dashboard/ai-overview/generate:
 *   post:
 *     summary: Regenerate and store the AI overview for ALL hospitals (cron/ops only)
 *     description: >
 *       Protected by the x-cron-secret header (must match the CRON_SECRET env var),
 *       not by user auth — intended for the daily scheduler (curl) or manual ops use.
 *       Each call makes one model call per hospital, so don't hammer it.
 *     tags: [Dashboard]
 *     parameters:
 *       - in: header
 *         name: x-cron-secret
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Generation summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     total: { type: integer }
 *                     succeeded: { type: integer }
 *                     failed: { type: integer }
 *       401:
 *         description: Missing or wrong x-cron-secret
 *       503:
 *         description: CRON_SECRET is not configured on the server
 */
dashboardRouter.post("/ai-overview/generate", async (req, res, next) => {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      throw new AppError("CRON_SECRET is not configured on the server", 503);
    }
    if (req.headers["x-cron-secret"] !== secret) {
      throw new AppError("Invalid cron secret", 401);
    }

    const result = await GenerateAllHospitalAiOverviews();

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

export default dashboardRouter;


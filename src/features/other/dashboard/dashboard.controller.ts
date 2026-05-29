import express from "express";
import { AuthUser } from "../../../middleware/Auth";
import { AppError } from "../../../utils/AppError";
import { COMMON_ERROR } from "../../../constants/messages";
import { GetDashboardSummary } from "./dashboard.service";

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

export default dashboardRouter;

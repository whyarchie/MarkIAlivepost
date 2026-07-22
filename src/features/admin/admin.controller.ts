import express from "express";
import {
  AdminLoginSchema,
  AdminSchema,
  AdminProgressJsonSchema,
  AdminDeletePatientSchema,
  AdminDeleteConditionSchema,
  AdminUpdateConditionStatusSchema,
} from "./admin.schema";
import {
  AdminCreate,
  AdminLogin,
  AdminGetPatientByMobile,
  AdminUpdateProgressJsonField,
  AdminDeletePatient,
  AdminDeletePatientCondition,
  AdminUpdatePatientConditionStatus,
} from "./admin.service";
import HashPassword from "../../utils/hashUtils";
import { AuthUser, requireRole } from "../../middleware/Auth";
import { AppError } from "../../utils/AppError";

const adminRouter = express.Router();

/**
 * @swagger
 * tags:
 *   name: Admins
 *   description: API to manage admins
 */

/**
 * @swagger
 * /api/v1/admin/create:
 *   post:
 *     summary: Create a new admin (admin only)
 *     tags: [Admins]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               userId:
 *                 type: string
 *               password:
 *                 type: string
 *             example:
 *               name: "Super Admin"
 *               userId: "super_admin"
 *               password: "Admin@123"
 *     responses:
 *       201:
 *         description: Admin created successfully
 *       401:
 *         description: Missing or invalid authentication token
 *       403:
 *         description: Authenticated user is not an admin
 */
adminRouter.post(
  "/create",
  AuthUser,
  requireRole("Admin"),
  async (req, res, next) => {
    try {
      let safeData = AdminSchema.parse(req.body);
      const hash = await HashPassword(safeData.password);
      safeData.password = hash;
      const admin = await AdminCreate(safeData);
      res.status(201).json({
        success: true,
        data: admin,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/admin/login:
 *   post:
 *     summary: Login an admin
 *     tags: [Admins]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *               password:
 *                 type: string
 *             example:
 *               userId: "super_admin"
 *               password: "Admin@123"
 *     responses:
 *       200:
 *         description: Login successful, returns token cookie
 */
adminRouter.post("/login", async (req, res, next) => {
  try {
    const safeData = AdminLoginSchema.parse(req.body);
    const admin = await AdminLogin(safeData);
    res
      .status(200)
      .cookie("token", admin.token, {
        httpOnly: true,
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      })
      .json({ success: true, data: admin.safeData });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/admin/patient:
 *   get:
 *     summary: Look up a patient (with conditions and progress) by mobile number (admin only)
 *     tags: [Admins]
 *     parameters:
 *       - in: query
 *         name: mobile
 *         required: true
 *         schema:
 *           type: string
 *         example: "9876543210"
 *     responses:
 *       200:
 *         description: Patient profile with conditions and their progress entries
 *       400:
 *         description: Missing mobile query parameter
 *       401:
 *         description: Missing or invalid authentication token
 *       403:
 *         description: Authenticated user is not an admin
 *       404:
 *         description: Patient not found
 */
adminRouter.get(
  "/patient",
  AuthUser,
  requireRole("Admin"),
  async (req, res, next) => {
    try {
      const mobile = String(req.query.mobile ?? "").trim();
      if (!mobile) {
        throw new AppError("mobile query parameter is required", 400);
      }
      const patient = await AdminGetPatientByMobile(mobile);
      res.status(200).json({ success: true, data: patient });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/admin/progress/jsonfield:
 *   patch:
 *     summary: Set the jsonField (and optionally the follow-up status) on a patient progress entry (admin only)
 *     tags: [Admins]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               progressId:
 *                 type: integer
 *               jsonField:
 *                 type: object
 *               followUpStatus:
 *                 type: string
 *                 enum: [SUCCESSFUL, SCHEDULED, NOT_ANSWERING, FAILED, SUSPEND]
 *             example:
 *               progressId: 12
 *               jsonField: { callSummary: "Patient stable", sugarLevel: 120 }
 *               followUpStatus: "SUCCESSFUL"
 *     responses:
 *       200:
 *         description: Updated progress entry
 *       400:
 *         description: Validation error
 *       401:
 *         description: Missing or invalid authentication token
 *       403:
 *         description: Authenticated user is not an admin
 *       404:
 *         description: Progress entry not found
 */
adminRouter.patch(
  "/progress/jsonfield",
  AuthUser,
  requireRole("Admin"),
  async (req, res, next) => {
    try {
      const { progressId, jsonField, followUpStatus } =
        AdminProgressJsonSchema.parse(req.body);
      const updated = await AdminUpdateProgressJsonField(
        progressId,
        jsonField,
        followUpStatus
      );
      res.status(200).json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/admin/patient:
 *   delete:
 *     summary: Delete an entire patient and all their data (admin only)
 *     tags: [Admins]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [patientId]
 *             properties:
 *               patientId:
 *                 type: integer
 *             example:
 *               patientId: 12
 *     responses:
 *       200:
 *         description: Patient deleted
 *       400:
 *         description: Validation error
 *       401:
 *         description: Missing or invalid authentication token
 *       403:
 *         description: Authenticated user is not an admin
 *       404:
 *         description: Patient not found
 */
adminRouter.delete(
  "/patient",
  AuthUser,
  requireRole("Admin"),
  async (req, res, next) => {
    try {
      const { patientId } = AdminDeletePatientSchema.parse(req.body);
      const deleted = await AdminDeletePatient(patientId);
      res.status(200).json({ success: true, data: deleted });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/admin/condition:
 *   delete:
 *     summary: Delete a single patient condition (admin only)
 *     tags: [Admins]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [patientConditionId]
 *             properties:
 *               patientConditionId:
 *                 type: integer
 *             example:
 *               patientConditionId: 34
 *     responses:
 *       200:
 *         description: Patient condition deleted
 *       400:
 *         description: Validation error
 *       401:
 *         description: Missing or invalid authentication token
 *       403:
 *         description: Authenticated user is not an admin
 *       404:
 *         description: Patient condition not found
 */
adminRouter.delete(
  "/condition",
  AuthUser,
  requireRole("Admin"),
  async (req, res, next) => {
    try {
      const { patientConditionId } = AdminDeleteConditionSchema.parse(req.body);
      const deleted = await AdminDeletePatientCondition(patientConditionId);
      res.status(200).json({ success: true, data: deleted });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/admin/condition/status:
 *   patch:
 *     summary: Update the clinical status of a single patient condition (admin only)
 *     tags: [Admins]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [patientConditionId, status]
 *             properties:
 *               patientConditionId:
 *                 type: integer
 *               status:
 *                 type: string
 *                 enum: [STABLE, CRITICAL, RECOVERED]
 *             example:
 *               patientConditionId: 34
 *               status: "STABLE"
 *     responses:
 *       200:
 *         description: Updated patient condition (id and new status)
 *       400:
 *         description: Validation error
 *       401:
 *         description: Missing or invalid authentication token
 *       403:
 *         description: Authenticated user is not an admin
 *       404:
 *         description: Patient condition not found
 */
adminRouter.patch(
  "/condition/status",
  AuthUser,
  requireRole("Admin"),
  async (req, res, next) => {
    try {
      const { patientConditionId, status } =
        AdminUpdateConditionStatusSchema.parse(req.body);
      const updated = await AdminUpdatePatientConditionStatus(
        patientConditionId,
        status
      );
      res.status(200).json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  }
);

export default adminRouter;

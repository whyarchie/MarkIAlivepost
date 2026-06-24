import express from "express";
import { AdminLoginSchema, AdminSchema } from "./admin.schema";
import { AdminCreate, AdminLogin } from "./admin.service";
import HashPassword from "../../utils/hashUtils";
import { AuthUser, requireRole } from "../../middleware/Auth";

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

export default adminRouter;

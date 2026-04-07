import express from "express";
import { AuthUser } from "../../middleware/Auth";
import { HospitalLoginSchema, HospitalSchema } from "./hospital.schema";
import { GetHospitalById, GetPatientMedicineForHospital, HospitalCreate, HospitalLogin, SearchHospital } from "./hospital.service";
import HashPassword from "../../utils/hashUtils";
import { success } from "zod";
import { AppError } from "../../utils/AppError";
import { COMMON_ERROR } from "../../constants/messages";
const hospitalRouter = express.Router();
/**
 * @swagger
 * tags:
 *   name: Hospitals
 *   description: API to manage hospitals
 */

/**
 * @swagger
 * /api/v1/hospital/create:
 *   post:
 *     summary: Create a new hospital
 *     tags: [Hospitals]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               helplineNumber:
 *                 type: string
 *               address:
 *                 type: string
 *               userId:
 *                 type: string
 *               password:
 *                 type: string
 *             example:
 *               name: "Apollo Hospital Delhi"
 *               helplineNumber: "011-26825000"
 *               address: "Sarita Vihar, Delhi Mathura Road, New Delhi - 110076"
 *               userId: "apollo_delhi"
 *               password: "Hospital@123"
 *     responses:
 *       201:
 *         description: Hospital created successfully
 */
//for now i have removed the admin logic as it require to have admin
hospitalRouter.post("/create", async (req, res, next) => {
  try {
    // const user = req.user!   // guaranteed by middleware

    // if (user.role !== "Admin") {
    //   return res.status(403).json({
    //     success: false,
    //     message: "Only admin can create hospitals",
    //   })
    // }

    let safeData = HospitalSchema.parse(req.body);
    const hash = await HashPassword(safeData.password);
    safeData.password = hash;
    const hospital = await HospitalCreate(safeData);
    res.status(201).json({
      success: true,
      data: hospital,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/hospital/login:
 *   post:
 *     summary: Login a hospital
 *     tags: [Hospitals]
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
 *               userId: "apollo_delhi"
 *               password: "Hospital@123"
 *     responses:
 *       200:
 *         description: Login successful, returns token cookie
 */
hospitalRouter.post('/login', async (req, res, next) => {
  try {

    const data = req.body
    const safeData = HospitalLoginSchema.parse(data);
    const hospital = await HospitalLogin(safeData)
    res.status(200).cookie("token", hospital.token, {
      httpOnly: true,       // JS can't read it — more secure
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000
    }).json({ success: true, data: hospital.safeData })
  } catch (error) {
    next(error)
  }
})

/**
 * @swagger
 * /api/v1/hospital/search:
 *   get:
 *     summary: Search hospitals by name
 *     tags: [Hospitals]
 *     parameters:
 *       - in: query
 *         name: name
 *         schema:
 *           type: string
 *         description: Search value
 *         example: "City"
 *     responses:
 *       200:
 *         description: Search results
 */
hospitalRouter.get('/search', async (req, res, next) => {
  try {
    const query = req.query.name as string
    const hospital = await SearchHospital(query)
    res.status(200).json({
      success: true,
      data: hospital
    })
  } catch (error) {
    next(error)
  }
})
/**
 * @swagger
 * /api/v1/hospital/id:
 *   get:
 *     summary: Get hospital by ID
 *     tags: [Hospitals]
 *     parameters:
 *       - in: query
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *         description: Hospital ID
 *         example: "1"
 *     responses:
 *       200:
 *         description: Hospital details
 */
hospitalRouter.get('/id', async (req, res, next) => {
  try {

    const id = req.query.key as string
    const safeId = parseInt(id)
    const hospital = await GetHospitalById(safeId)
    res.status(200).json({
      success: true,
      data: hospital
    })
  } catch (error) {
    next(error)
  }
})
/**
 * @swagger
 * /api/v1/hospital/patientmedicine:
 *   get:
 *     summary: Get patient medicine for hospital
 *     tags: [Hospitals]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *         description: Patient ID
 *         example: "1"
 *     responses:
 *       200:
 *         description: Patient medicine records
 *       400:
 *         description: Invalid patientId
 */
hospitalRouter.get("/patientmedicine", AuthUser, async (req, res, next) => {
  try {
    const user = req.user!;
    const patientId = Number(req.query.patientId);

    if (!patientId || isNaN(patientId)) {
      throw new AppError("patientId query is required", 400);
    }

    const result = await GetPatientMedicineForHospital(user, patientId);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});
export default hospitalRouter;

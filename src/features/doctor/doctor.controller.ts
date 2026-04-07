import express from "express";
import { AuthUser } from "../../middleware/Auth";
import { AppError } from "../../utils/AppError";
import { COMMON_ERROR } from "../../constants/messages";
import { DoctorSchema } from "./doctor.schema";
import { CreateDoctor, GetDoctorByHostpialId, getDoctorInformation, SearchDoctorForHospital } from "./doctor.service";
import { emitWarning } from "node:process";
import { success } from "zod";
import { equal } from "node:assert";

const doctorRouter = express.Router();

/**
 * @swagger
 * tags:
 *   name: Doctors
 *   description: API to manage doctors
 */

/**
 * @swagger
 * /api/v1/doctor/create:
 *   post:
 *     summary: Create a new doctor (Hospital Only)
 *     tags: [Doctors]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               username:
 *                 type: string
 *             example:
 *               name: "Dr. Rajesh Sharma"
 *               username: "dr.sharma"
 *     responses:
 *       201:
 *         description: Doctor created successfully
 *       404:
 *         description: Invalid hospital
 */
doctorRouter.post("/create", AuthUser, async (req, res, next) => {
  try {
    const user = req.user;
    if (user?.role != "Hospital") {
      throw new AppError(COMMON_ERROR.INVALID_HOSPITAL, 404);
    }
    const data = req.body;

    const safeData = DoctorSchema.parse({ hospitalId: user.id, ...data });
    const result = await CreateDoctor(safeData);
    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

//get all doctor by id
doctorRouter.get("/all", async (req, res, next) => {
  try {
    const id = req.query.id as string;
    const safeId = Number(id);
    const result = await GetDoctorByHostpialId(safeId)
    res.status(200).json({
      success: true,
      data: result
    })
  } catch (error) {
    next(error);
  }
});


//Search doctor 
doctorRouter.get('/search', AuthUser, async (req, res, next) => {
  try {
    const name = req.query.name as string
    const user = req.user!

    const id = user.id
    if (user.role != "Hospital") {
      throw new AppError(COMMON_ERROR.INVALID_ROLE, 403)
    }
    const result = await SearchDoctorForHospital({ name, id })
    res.status(200).json({
      success: true,
      data: result
    })
  } catch (error) {
    next(error)
  }

})
doctorRouter.get('/', AuthUser, async (req, res, next) => {
  try {
    const user = req.user
    const id = Number(req.query.id as string)
    if (user?.role != 'Hospital') {
      throw new AppError(COMMON_ERROR.INVALID_ROLE, 403)
    }
    const result = await getDoctorInformation({ id, hospitalId: user.id })
    res.status(200).json({
      success: true,
      data: result
    })
  } catch (error) {
    next(error)
  }
})
export default doctorRouter;

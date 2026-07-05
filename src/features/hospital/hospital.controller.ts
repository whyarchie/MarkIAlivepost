import express from "express";
import { AuthUser, requireRole } from "../../middleware/Auth";
import { HospitalLoginSchema, HospitalSchema, HospitalUpdateSchema, HospitalDeletePatientSchema, HospitalVerifyPaymentSchema } from "./hospital.schema";
import { GetAllHospitals, GetHospitalById, GetHospitalProfile, GetPatientMedicineForHospital, HospitalAddBalance, HospitalCreate, HospitalDeletePatient, HospitalLogin, HospitalPaymentWebhook, HospitalUpdate, HospitalVerifyPayment, SearchHospital } from "./hospital.service";
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
 *     summary: Create a new hospital (Admin Only)
 *     tags: [Hospitals]
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
 *               helplineNumber:
 *                 type: string
 *               contactNumber:
 *                 type: string
 *               email:
 *                 type: string
 *               address:
 *                 type: string
 *               userId:
 *                 type: string
 *               password:
 *                 type: string
 *               perDayPatientCost:
 *                 type: integer
 *                 description: Rupees charged to the hospital's wallet per enrolled patient per day (defaults to 100)
 *             example:
 *               name: "Apollo Hospital Delhi"
 *               helplineNumber: "01126825000"
 *               contactNumber: "9876543210"
 *               email: "billing@apollodelhi.com"
 *               address: "Sarita Vihar, Delhi Mathura Road, New Delhi - 110076"
 *               userId: "apollo_delhi"
 *               password: "Hospital@123"
 *               perDayPatientCost: 100
 *     responses:
 *       201:
 *         description: Hospital created successfully
 */
hospitalRouter.post("/create", AuthUser, async (req, res, next) => {
  try {
    const user = req.user!; // guaranteed by middleware

    if (user.role !== "Admin") {
      throw new AppError(COMMON_ERROR.INVALID_ROLE, 403);
    }

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
 * /api/v1/hospital/me:
 *   get:
 *     summary: Get the authenticated hospital's own profile (Hospital auth required)
 *     description: >
 *       Returns the hospital's full profile including the wallet balance (in
 *       paise) and the per-day patient cost (in rupees) charged for each day a
 *       patient is enrolled.
 *     tags: [Hospitals]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Hospital profile
 *       401:
 *         description: Missing or invalid authentication token
 *       403:
 *         description: Caller is not a hospital
 *       404:
 *         description: Hospital not found
 */
hospitalRouter.get("/me", AuthUser, requireRole("Hospital"), async (req, res, next) => {
  try {
    const user = req.user!; // guaranteed by middleware
    const hospital = await GetHospitalProfile(user.id);
    res.status(200).json({
      success: true,
      data: hospital,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/hospital/all:
 *   get:
 *     summary: List all hospitals with full info (Admin only)
 *     tags: [Hospitals]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: All hospitals including wallet balance and per-day patient cost
 *       401:
 *         description: Missing or invalid authentication token
 *       403:
 *         description: Authenticated user is not an admin
 */
hospitalRouter.get("/all", AuthUser, requireRole("Admin"), async (req, res, next) => {
  try {
    const hospitals = await GetAllHospitals();
    res.status(200).json({
      success: true,
      data: hospitals,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/hospital/update:
 *   patch:
 *     summary: Update a hospital's info and pricing (Admin only)
 *     description: >
 *       Partial update — only the fields present in the body are changed.
 *       perDayPatientCost is the amount in rupees charged to the hospital's
 *       wallet for each day a patient is enrolled.
 *     tags: [Hospitals]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [hospitalId]
 *             properties:
 *               hospitalId:
 *                 type: integer
 *               name:
 *                 type: string
 *               helplineNumber:
 *                 type: string
 *               contactNumber:
 *                 type: string
 *               email:
 *                 type: string
 *               address:
 *                 type: string
 *               userId:
 *                 type: string
 *               password:
 *                 type: string
 *               perDayPatientCost:
 *                 type: integer
 *             example:
 *               hospitalId: 1
 *               perDayPatientCost: 150
 *               helplineNumber: "01126825001"
 *     responses:
 *       200:
 *         description: Updated hospital
 *       400:
 *         description: Validation error
 *       401:
 *         description: Missing or invalid authentication token
 *       403:
 *         description: Authenticated user is not an admin
 *       404:
 *         description: Hospital not found
 *       409:
 *         description: userId or helpline number already used by another hospital
 */
hospitalRouter.patch("/update", AuthUser, requireRole("Admin"), async (req, res, next) => {
  try {
    const safeData = HospitalUpdateSchema.parse(req.body);
    if (safeData.password) {
      safeData.password = await HashPassword(safeData.password);
    }
    const hospital = await HospitalUpdate(safeData);
    res.status(200).json({
      success: true,
      data: hospital,
    });
  } catch (error) {
    next(error);
  }
});

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
/**
 * @swagger
 * /api/v1/hospital/patient:
 *   delete:
 *     summary: Remove a patient from this hospital's care (Hospital auth required)
 *     description: >
 *       Deletes the patient's enrollment with the authenticated hospital. If the
 *       patient is also enrolled with other hospitals, only this hospital's
 *       patient conditions are removed; otherwise the whole patient is deleted.
 *     tags: [Hospitals]
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
 *         description: >
 *           Patient removed. `data.deleted` is "patient" when the whole patient
 *           was deleted, or "conditions" when only this hospital's enrollment was.
 *       400:
 *         description: Validation error
 *       401:
 *         description: Missing or invalid authentication token
 *       403:
 *         description: Caller is not a hospital, or the patient isn't enrolled with it
 *       404:
 *         description: Patient not found
 */
hospitalRouter.delete("/patient", AuthUser, async (req, res, next) => {
  try {
    const user = req.user!; // guaranteed by middleware

    if (user.role !== "Hospital") {
      throw new AppError(COMMON_ERROR.INVALID_ROLE, 403);
    }

    const { patientId } = HospitalDeletePatientSchema.parse(req.body);
    const result = await HospitalDeletePatient(user.id, patientId);

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

hospitalRouter.post("/order", AuthUser, async (req, res, next) => {
  try {
    const user = req.user!; // guaranteed by middleware

    if (user.role !== "Hospital") {
      throw new AppError(COMMON_ERROR.INVALID_ROLE, 403);
    }

    const amount = Number(req.body.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new AppError("Invalid amount", 400);
    }

    const result = await HospitalAddBalance(user.id, amount);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/hospital/verify:
 *   post:
 *     summary: Verify a Razorpay payment and credit the hospital balance (Hospital auth required)
 *     description: >
 *       Called after the Razorpay checkout completes. Verifies the payment
 *       signature, marks the order as paid and credits the hospital's balance.
 *       Idempotent — verifying the same payment again does not credit twice.
 *     tags: [Hospitals]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [razorpay_order_id, razorpay_payment_id, razorpay_signature]
 *             properties:
 *               razorpay_order_id:
 *                 type: string
 *               razorpay_payment_id:
 *                 type: string
 *               razorpay_signature:
 *                 type: string
 *             example:
 *               razorpay_order_id: "order_PqR3sT4uV5wX6y"
 *               razorpay_payment_id: "pay_PqR3sT4uV5wX6y"
 *               razorpay_signature: "9ef4dffbfd84f1318f6739a3ce19f9d85851857ae648f114332d8401e0949a3d"
 *     responses:
 *       200:
 *         description: Payment verified; order marked paid and balance credited
 *       400:
 *         description: Validation error or invalid payment signature
 *       401:
 *         description: Missing or invalid authentication token
 *       403:
 *         description: Caller is not a hospital, or the order isn't theirs
 *       404:
 *         description: Order not found
 */
hospitalRouter.post("/verify", AuthUser, async (req, res, next) => {
  try {
    const user = req.user!; // guaranteed by middleware

    if (user.role !== "Hospital") {
      throw new AppError(COMMON_ERROR.INVALID_ROLE, 403);
    }

    const data = HospitalVerifyPaymentSchema.parse(req.body);
    const result = await HospitalVerifyPayment(user.id, data);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/hospital/webhook:
 *   post:
 *     summary: Razorpay payment webhook (server-to-server, no user auth)
 *     description: >
 *       Endpoint configured in the Razorpay dashboard. Authenticated by the
 *       `X-Razorpay-Signature` header (HMAC-SHA256 of the raw body with the
 *       webhook secret), not by a user session. On a `payment.captured` event
 *       the matching order is marked paid and the hospital balance is credited.
 *       Idempotent; always returns 200 on a valid signature so Razorpay stops
 *       retrying.
 *     tags: [Hospitals]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Webhook processed (or acknowledged and ignored)
 *       400:
 *         description: Missing body or invalid webhook signature
 */
hospitalRouter.post("/webhook", async (req, res, next) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const rawBody = req.rawBody;

    if (!rawBody) {
      throw new AppError("Missing request body", 400);
    }

    const result = await HospitalPaymentWebhook(
      rawBody,
      typeof signature === "string" ? signature : "",
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

export default hospitalRouter;

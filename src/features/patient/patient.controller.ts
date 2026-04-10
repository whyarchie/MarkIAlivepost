import express, { type NextFunction } from "express";
import {
  AssignMedicineSchema,
  CreateprogressSchema,
  medicalHistorySchema,
  PatientConditionSchema,
  patientLoginSchema,
  patientSchema,
  type CreateprogressInput,
  type MedicalHistoryCreate,
  type PatientInput,
  type PatientLoginInput,
} from "./patient.schema";
import {
  AssignMedicine,
  CreatePatient,
  CreatePatientProgress,
  DeletePatientService,
  GetAssignedMedicineForPatient,
  GetPatientForHostpital,
  GetPatientProgressForPatient,
  GetQuestionForToday,
  LoginPatient,
  MedicalHistoryCreateService,
  PatientConditionCreate,
  PatientConditionGet,
  SavePatientFcmToken,
  SearchPatientByMobile,
} from "./patient.service";
import { AuthUser } from "../../middleware/Auth";
import { AppError } from "../../utils/AppError";
import { COMMON_ERROR } from "../../constants/messages";
const patientRouter = express.Router();

/**
 * @swagger
 * /api/v1/patient/search:
 *   get:
 *     summary: Search patient by mobile number (Hospital auth required)
 *     tags: [Patients]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: mobile
 *         required: true
 *         schema:
 *           type: string
 *         description: Patient mobile number
 *         example: "9876543210"
 *     responses:
 *       200:
 *         description: Patient found with conditions and history
 *       404:
 *         description: Patient not found
 */
patientRouter.get("/search", AuthUser, async (req, res, next) => {
  try {
    const user = req.user;
    if (user?.role !== "Hospital") {
      throw new AppError(COMMON_ERROR.INVALID_ROLE, 403);
    }
    const mobile = req.query.mobile as string;
    if (!mobile) {
      throw new AppError("mobile query parameter is required", 400);
    }
    const result = await SearchPatientByMobile(mobile, user.id);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * tags:
 *   name: Patients
 *   description: API to manage patients
 */

/**
 * @swagger
 * /api/v1/patient/create:
 *   post:
 *     summary: Create a new patient
 *     tags: [Patients]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - dateOfBirth
 *               - bloodGroup
 *               - gender
 *               - mobileNumber
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 1
 *               dateOfBirth:
 *                 type: string
 *                 format: date-time
 *               bloodGroup:
 *                 type: string
 *                 enum: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]
 *               gender:
 *                 type: string
 *                 enum: ["MALE", "FEMALE", "OTHER"]
 *               mobileNumber:
 *                 type: string
 *                 pattern: "^(?:\\+91|91)?[6-9]\\d{9}$"
 *             example:
 *               name: "Amit Kumar"
 *               dateOfBirth: "1985-06-15T00:00:00.000Z"
 *               bloodGroup: "B+"
 *               gender: "MALE"
 *               mobileNumber: "9876543210"
 *     responses:
 *       200:
 *         description: Patient created successfully
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
 *                     id:
 *                       type: integer
 *                     name:
 *                       type: string
 *                     dateOfBirth:
 *                       type: string
 *                       format: date-time
 *                     bloodGroup:
 *                       type: string
 *                     gender:
 *                       type: string
 *                     mobileNumber:
 *                       type: string
 *       400:
 *         description: Validation error
 */
patientRouter.post("/create", async (req, res, next) => {
  const data: PatientInput = req.body;
  try {
    const safeData = patientSchema.parse(data);

    const patient = await CreatePatient(safeData);
    res.status(200).json({
      success: true,
      data: patient,
    });
  } catch (error) {
    next(error);
  }
});
/**
 * @swagger
 * /api/v1/patient/login:
 *   post:
 *     summary: Login a patient
 *     tags: [Patients]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - mobileNumber
 *               - dateOfBirth
 *             properties:
 *               mobileNumber:
 *                 type: string
 *                 pattern: "^(?:\\+91|91)?[6-9]\\d{9}$"
 *               dateOfBirth:
 *                 type: string
 *                 format: date-time
 *             example:
 *               mobileNumber: "9876543210"
 *               dateOfBirth: "1985-06-15T00:00:00.000Z"
 *     responses:
 *       200:
 *         description: Login successful, returns token cookie
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
 *                     id:
 *                       type: integer
 *                     name:
 *                       type: string
 *                     mobileNumber:
 *                       type: string
 *       401:
 *         description: Invalid credentials
 */
patientRouter.post("/login", async (req, res, next) => {
  const data: PatientLoginInput = req.body;
  try {
    const safeData = patientLoginSchema.parse(data);

    const patient = await LoginPatient(safeData);
    res.status(200).cookie("token", patient.token).json({
      success: true,
      data: patient.patient,
    });
  } catch (error) {
    next(error);
  }
});


/**
 * @swagger
 * /api/v1/patient/loginmedicine:
 *   post:
 *     summary: Login and get assigned medicines
 *     tags: [Patients]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - mobileNumber
 *               - dateOfBirth
 *             properties:
 *               mobileNumber:
 *                 type: string
 *                 pattern: "^(?:\\+91|91)?[6-9]\\d{9}$"
 *               dateOfBirth:
 *                 type: string
 *                 format: date-time
 *             example:
 *               mobileNumber: "9876543210"
 *               dateOfBirth: "1985-06-15T00:00:00.000Z"
 *     responses:
 *       200:
 *         description: Login successful, returns array of assigned medicines
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       medicineId:
 *                         type: integer
 *                       quantity:
 *                         type: integer
 *                       tillDate:
 *                         type: string
 *                         format: date-time
 *                       medicine:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           brandName:
 *                             type: string
 *                           genericName:
 *                             type: string
 *                       timings:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             timing:
 *                               type: string
 *                               format: date-time
 *       401:
 *         description: Invalid credentials
 */
patientRouter.post('/loginmedicine', async (req, res, next) => {
  try {
    const data: PatientLoginInput = req.body;
    const safeData = patientLoginSchema.parse(data);

    const result = await LoginPatient(safeData);
    const medicine = await GetAssignedMedicineForPatient(result.patient.id)
    res.status(200).cookie("token", result.token).json({
      success: true,
      data: medicine
    })
  } catch (error) {
    next(error)
  }
})

/**
 * @swagger
 * /api/v1/patient/delete:
 *   delete:
 *     summary: Delete a patient (Self)
 *     tags: [Patients]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Patient deleted successfully
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
 *                     id:
 *                       type: integer
 *                     name:
 *                       type: string
 *       403:
 *         description: Unauthorized — only patients can delete themselves
 */
//Patient Delete
patientRouter.delete("/delete", AuthUser, async (req, res, next) => {
  try {
    const userInfo = req.user;
    if (userInfo?.role == "Patient") {
      const id = userInfo?.id;
      const data = await DeletePatientService(id);
      console.log(data);
      res.status(200).json({
        success: true,
        data: data,
      });
    }
  } catch (error) {
    next(error);
  }
});
/**
 * @swagger
 * /api/v1/patient/medicalhistorycreate:
 *   post:
 *     summary: Create Medical History
 *     tags: [Patients]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - diseaseId
 *               - patientId
 *               - startDate
 *             properties:
 *               diseaseId:
 *                 type: integer
 *                 minimum: 1
 *               patientId:
 *                 type: integer
 *                 minimum: 1
 *               description:
 *                 type: string
 *                 maxLength: 1500
 *               startDate:
 *                 type: string
 *                 format: date-time
 *               endDate:
 *                 type: string
 *                 format: date-time
 *                 description: Must be >= startDate
 *             example:
 *               diseaseId: 1
 *               patientId: 1
 *               description: "Patient experienced severe headaches"
 *               startDate: "2023-01-01T00:00:00.000Z"
 *     responses:
 *       200:
 *         description: Medical history created successfully
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
 *                     id:
 *                       type: integer
 *                     diseaseId:
 *                       type: integer
 *                     patientId:
 *                       type: integer
 *                     description:
 *                       type: string
 *                     startDate:
 *                       type: string
 *                       format: date-time
 *                     endDate:
 *                       type: string
 *                       format: date-time
 *       404:
 *         description: Invalid patient or disease ID
 */
//Medical History create
patientRouter.post("/medicalhistorycreate", async (req, res, next) => {
  const data: MedicalHistoryCreate = req.body;
  try {
    const safeData = medicalHistorySchema.parse(data);
    const newData = await MedicalHistoryCreateService(safeData);
    res.status(200).json({
      success: true,
      data: newData,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/patient/condition:
 *   post:
 *     summary: Request/Create a patient condition
 *     tags: [Patients]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - patientId
 *               - diseaseId
 *               - hospitalId
 *               - status
 *               - startDate
 *             properties:
 *               patientId:
 *                 type: integer
 *                 minimum: 1
 *               diseaseId:
 *                 type: integer
 *                 minimum: 1
 *               hospitalId:
 *                 type: integer
 *                 minimum: 1
 *               doctorId:
 *                 type: integer
 *                 minimum: 1
 *               status:
 *                 type: string
 *                 enum: ["STABLE", "CRITICAL", "RECOVERED"]
 *               startDate:
 *                 type: string
 *                 format: date-time
 *               endDate:
 *                 type: string
 *                 format: date-time
 *                 description: Must be >= startDate
 *             example:
 *               patientId: 1
 *               diseaseId: 1
 *               hospitalId: 1
 *               status: "STABLE"
 *               startDate: "2023-01-01T00:00:00.000Z"
 *     responses:
 *       201:
 *         description: Patient condition created
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
 *                     id:
 *                       type: integer
 *                     patientId:
 *                       type: integer
 *                     diseaseId:
 *                       type: integer
 *                     hospitalId:
 *                       type: integer
 *                     doctorId:
 *                       type: integer
 *                     status:
 *                       type: string
 *                     startDate:
 *                       type: string
 *                       format: date-time
 *                     endDate:
 *                       type: string
 *                       format: date-time
 *       404:
 *         description: Invalid patient, disease, hospital, or doctor ID
 */
//Create Patient Condition
patientRouter.post("/condition", AuthUser, async (req, res, next) => {
  try {
    let data = req.body;
    const user = req.user;
    // Validate input data
    const safeData = PatientConditionSchema.parse(data);
    const payload = {
      ...safeData,
      [`${user?.role.toLowerCase()}Id`]: user?.id
    }
    const patientCondition = await PatientConditionCreate(payload)
    // Success response
    res.status(201).json({
      success: true,
      data: patientCondition,
    });


  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/patient/condition/:
 *   get:
 *     summary: Get patient condition by ID
 *     tags: [Patients]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Condition ID
 *         example: 1
 *     responses:
 *       200:
 *         description: Patient condition details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       patientId:
 *                         type: integer
 *                       diseaseId:
 *                         type: integer
 *                       hospitalId:
 *                         type: integer
 *                       status:
 *                         type: string
 *                       startDate:
 *                         type: string
 *                         format: date-time
 *       400:
 *         description: Invalid condition ID
 */
patientRouter.get("/condition/", AuthUser, async (req, res, next) => {
  try {
    const user = req.user!;
    const id = parseInt(req.query.id as string)


    if (!id) {
      throw new AppError("Invalid condition id", 400);
    }

    const condition = await PatientConditionGet({ user, safeId: id });

    res.json({
      success: true,
      data: condition,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/patient/condition/medicine:
 *   post:
 *     summary: Assign medicine to a condition (Hospital Only)
 *     tags: [Patients]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - patientConditionId
 *               - medicines
 *             properties:
 *               patientConditionId:
 *                 type: integer
 *                 minimum: 1
 *               medicines:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 20
 *                 items:
 *                   type: object
 *                   required:
 *                     - medicineId
 *                     - tillDate
 *                     - timings
 *                   properties:
 *                     medicineId:
 *                       type: integer
 *                       minimum: 1
 *                     quantity:
 *                       type: integer
 *                       minimum: 1
 *                       default: 1
 *                     tillDate:
 *                       type: string
 *                       format: date-time
 *                     timings:
 *                       type: array
 *                       minItems: 1
 *                       maxItems: 10
 *                       items:
 *                         type: string
 *                         pattern: "^([01]\\d|2[0-3]):([0-5]\\d)$"
 *             example:
 *               patientConditionId: 1
 *               medicines:
 *                 - medicineId: 1
 *                   quantity: 2
 *                   tillDate: "2023-12-31T00:00:00.000Z"
 *                   timings: ["08:00", "20:00"]
 *     responses:
 *       200:
 *         description: Medicine assigned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       patientConditionId:
 *                         type: integer
 *                       medicineId:
 *                         type: integer
 *                       quantity:
 *                         type: integer
 *                       tillDate:
 *                         type: string
 *                         format: date-time
 *                       medicine:
 *                         type: object
 *                       timings:
 *                         type: array
 *                         items:
 *                           type: object
 *       403:
 *         description: Invalid role — only hospitals can assign medicine
 *       404:
 *         description: Patient condition not found
 */
patientRouter.post("/condition/medicine", AuthUser, async (req, res, next) => {
  try {
    const user = req.user
    const safeData = AssignMedicineSchema.parse(req.body)

    if (user?.role !== "Hospital") {
      throw new AppError(COMMON_ERROR.INVALID_ROLE, 403)
    }

    const result = await AssignMedicine(safeData, user)

    res.status(200).json({
      success: true,
      data: result
    })
  } catch (error) {
    next(error)
  }
})
/**
 * @swagger
 * /api/v1/patient/condition/assignedmedicine:
 *   get:
 *     summary: Get assigned medicines for a patient
 *     tags: [Patients]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved assigned medicines
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 - id: 1
 *                   patientConditionId: 1
 *                   medicineId: 1
 *                   quantity: 2
 *                   tillDate: "2023-12-31T00:00:00.000Z"
 *                   timings: ["08:00", "20:00"]
 *                   medicine:
 *                     id: 1
 *                     name: "Paracetamol"
 *                     description: "For fever"
 *       403:
 *         description: Invalid role
 */

patientRouter.get('/condition/assignedmedicine', AuthUser, async (req, res, next) => {
  try {

    const user = req.user;
    if (user?.role !== "Patient") {
      throw new AppError(COMMON_ERROR.INVALID_ROLE, 403)
    }
    const medicine = await GetAssignedMedicineForPatient(user.id)
    res.status(200).json({
      success: true,
      data: medicine
    })
  } catch (error) {
    next(error)
  }

})

/**
 * @swagger
 * /api/v1/patient/condition/createprogress:
 *   post:
 *     summary: Create patient progress schedule (Hospital Only)
 *     tags: [Patients]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - patientConditionId
 *               - frequency
 *               - totalOccurrences
 *               - questions
 *               - startDate
 *             properties:
 *               patientConditionId:
 *                 type: integer
 *                 description: ID of the patient condition
 *               frequency:
 *                 type: integer
 *                 minimum: 1
 *                 description: Gap in days between each occurrence
 *               totalOccurrences:
 *                 type: integer
 *                 minimum: 1
 *                 description: Total number of scheduled progress entries
 *               questions:
 *                 type: array
 *                 minItems: 1
 *                 description: Questions to ask the patient
 *                 items:
 *                   type: object
 *                   required:
 *                     - question
 *                     - isText
 *                   properties:
 *                     question:
 *                       type: string
 *                     image:
 *                       type: string
 *                     isText:
 *                       type: boolean
 *                     options:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           text:
 *                             type: string
 *                           image:
 *                             type: string
 *               startDate:
 *                 type: string
 *                 format: date-time
 *                 description: Start date for the schedule
 *             example:
 *               patientConditionId: 1
 *               frequency: 7
 *               totalOccurrences: 4
 *               questions:
 *                 - question: "How are you feeling?"
 *                   isText: true
 *                 - question: "Rate your pain from these options"
 *                   isText: false
 *                   options:
 *                     - text: "1"
 *                     - text: "5"
 *                     - text: "10"
 *               startDate: "2024-01-01T00:00:00.000Z"
 *     responses:
 *       201:
 *         description: Progress schedule created
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
 *                     count:
 *                       type: integer
 *                       description: Number of progress entries created
 *       403:
 *         description: Invalid role — only hospitals can create progress
 */
//patient Progress maker 
patientRouter.post('/condition/createprogress', AuthUser, async (req, res, next) => {
  try {
    const user = req.user
    const data: CreateprogressInput = req.body
    let safeData = CreateprogressSchema.parse(data)
    if (user?.role !== 'Hospital') {
      throw new AppError(COMMON_ERROR.INVALID_ROLE, 403)
    }
    const actualData = {
      ...safeData,
      hospitalId: user.id
    }
    const result = await CreatePatientProgress(actualData)
    res.status(201).json({
      success: true,
      data: result
    })
  } catch (error) {
    next(error)
  }
})

/**
 * @swagger
 * /api/v1/patient/condition/progress:
 *   get:
 *     summary: Get patient progress entries (Hospital Only)
 *     tags: [Patients]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Patient Condition ID
 *         example: 1
 *     responses:
 *       200:
 *         description: Patient progress entries
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       patientConditionId:
 *                         type: integer
 *                       scheduledDate:
 *                         type: string
 *                         format: date-time
 *                       questions:
 *                         type: string
 *                       answer:
 *                         type: string
 *                         nullable: true
 *       403:
 *         description: Invalid role — only hospitals can view progress
 */
//get patient progress for hospital 
patientRouter.get('/condition/progress', AuthUser, async (req, res, next) => {
  try {
    const patientConditionId = Number(req.query.id as string)
    const user = req.user
    if (user?.role !== 'Hospital') {
      throw new AppError(COMMON_ERROR.INVALID_ROLE)
    }
    const result = await GetPatientForHostpital({ patientConditionId, hospitalId: user.id })
    res.status(200).json({
      success: true,
      data: result
    })
  } catch (error) {
    next(error)
  }
})

/**
 * @swagger
 * /api/v1/patient/condition/patientquestions:
 *   get:
 *     summary: Get patient progress entries (Patient Only)
 *     tags: [Patients]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Patient progress entries
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       patientConditionId:
 *                         type: integer
 *                       description:
 *                         type: string
 *                         nullable: true
 *                       jsonField:
 *                         type: object
 *                         nullable: true
 *                       followUpStatus:
 *                         type: string
 *                         enum: ["SUCCESSFUL", "SCHEDULED", "NOT_ANSWERING", "FAILED", "SUSPEND"]
 *                       questions:
 *                         type: string
 *                         nullable: true
 *                       scheduledDate:
 *                         type: string
 *                         format: date-time
 *                       percentageRecovery:
 *                         type: integer
 *                         nullable: true
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *       403:
 *         description: Invalid role — only patients can view their progress
 */
//get patient progress for Patient 
patientRouter.get('/condition/patientquestions', AuthUser, async (req, res, next) => {
  try {
    const user = req.user
    if (user?.role !== 'Patient') {
      throw new AppError(COMMON_ERROR.INVALID_ROLE)
    }
    const result = await GetPatientProgressForPatient(user.id)
    res.status(200).json({
      success: true,
      data: result
    })
  } catch (error) {
    next(error)
  }
})

patientRouter.get('/condition/patientquestiontoday' , AuthUser , async (req , res ,next)=>{
  try{
    const user = req.user
    if(user?.role!=='Patient'){
      throw new AppError(COMMON_ERROR.INVALID_ROLE , 403)
    }
    const questions:any = await GetQuestionForToday(user.id)
    res.status(200).json({
      success: true,
      data: questions
    })
  }catch(error){
    next(error)
  }
})

/**
 * @swagger
 * /api/v1/patient/fcm:
 *   post:
 *     summary: Save patient FCM (push notification) token
 *     tags: [Patients]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fcm
 *             properties:
 *               fcm:
 *                 type: string
 *                 description: Firebase Cloud Messaging token
 *             example:
 *               fcm: "dGhpcyBpcyBhIHNhbXBsZSBGQ00gdG9rZW4..."
 *     responses:
 *       201:
 *         description: FCM token saved/updated
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
 *                     id:
 *                       type: integer
 *                     patientId:
 *                       type: integer
 *                     fcmToken:
 *                       type: string
 *       403:
 *         description: Invalid role
 */
//post fcm token  
patientRouter.post('/fcm', AuthUser, async (req, res, next) => {
  try {
    const data = req.body
    const user = req.user!
    console.log(user)
    if (user?.role !== 'Patient') {
      throw new AppError(COMMON_ERROR.INVALID_ROLE)
    }
    const device = await SavePatientFcmToken({ patientId: user.id, fcmToken: data.fcm })
    res.status(201).json({
      success: true,
      data: device
    })

  } catch (error) {
    next(error)
  }
})



export default patientRouter;



import express from "express";
import { MedicineSchema, type MedicineCreateSchema } from "./medicine.schema";
import { CreateMedicine, MedicineDetail, MedicineSearch } from "./medicine.service";

const medicineRouter = express.Router();
/**
 * @swagger
 * tags:
 *   name: Medicines
 *   description: API to manage medicines
 */

/**
 * @swagger
 * /api/v1/medicine/create:
 *   post:
 *     summary: Create a new medicine
 *     tags: [Medicines]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               brandName:
 *                 type: string
 *               genericName:
 *                 type: string
 *               dosageForm:
 *                 type: string
 *                 enum: ["TABLET", "CAPSULE", "SYRUP", "INJECTION", "OINTMENT", "DROPS", "CREAM", "GEL", "INHALER", "POWDER"]
 *               dosageStrength:
 *                 type: string
 *               manufacturer:
 *                 type: string
 *             example:
 *               brandName: "Crocin"
 *               genericName: "Paracetamol"
 *               dosageForm: "TABLET"
 *               dosageStrength: "500mg"
 *               manufacturer: "GSK"
 *     responses:
 *       200:
 *         description: Medicine created successfully
 */
//Create Medicine
medicineRouter.post("/create", async (req, res, next) => {
  try {
    const data: MedicineCreateSchema = req.body;
    const safeData = MedicineSchema.parse(data);
    const medicine = await CreateMedicine(safeData);
    res.status(200).json({
      success: true,
      data: medicine,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/medicine/search:
 *   get:
 *     summary: Search medicines by name
 *     tags: [Medicines]
 *     parameters:
 *       - in: query
 *         name: value
 *         schema:
 *           type: string
 *         description: Search value
 *         example: "Para"
 *     responses:
 *       200:
 *         description: Search results
 */
//Search Medicine or for debouncing
medicineRouter.get("/search", async (req, res, next) => {
  try {
    const value = req.query.value as string;
    const medicine = await MedicineSearch(value);
    res.status(200).json({
      success: true,
      data: medicine,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/medicine/id:
 *   get:
 *     summary: Get medicine by ID
 *     tags: [Medicines]
 *     parameters:
 *       - in: query
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Medicine ID
 *         example: "1"
 *     responses:
 *       200:
 *         description: Medicine details
 */
//Search medicine by id
medicineRouter.get("/id", async (req, res, next) => {
  try {
    const value = req.query.id as string
    const id = parseInt(value)
    const medicine = await MedicineDetail(id)
    res.status(200).json({
      success: true,
      data: medicine
    })
  } catch (error) {
    next(error)
  }
})
export default medicineRouter;

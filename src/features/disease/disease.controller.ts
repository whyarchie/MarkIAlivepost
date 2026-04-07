import express from "express";
import { diseaseSchema, type DiseaseCreateSchema } from "./disease.schema";
import { CreateDisease, DiseaseDataByIdService, DiseaseSearchService } from "./disease.service";

const diseaseRouter = express.Router();

/**
 * @swagger
 * tags:
 *   name: Diseases
 *   description: API to manage diseases
 */

/**
 * @swagger
 * /api/v1/disease/create:
 *   post:
 *     summary: Create a new disease
 *     tags: [Diseases]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: ["CHRONIC", "ACUTE"]
 *               description:
 *                 type: string
 *             example:
 *               name: "Hypertension"
 *               type: "CHRONIC"
 *               description: "Persistently elevated arterial blood pressure"
 *     responses:
 *       201:
 *         description: Disease created successfully
 */
diseaseRouter.post("/create", async (req, res, next) => {
  try {
    const data: DiseaseCreateSchema = req.body;
    const safeData = diseaseSchema.parse(data);
    const diseaseData = await CreateDisease(safeData);
    res.status(201).json({
      success: true,
      data: diseaseData,
    });
  } catch (error) {
    next(error);
  }
});
/**
 * @swagger
 * /api/v1/disease/search:
 *   get:
 *     summary: Search diseases by name
 *     tags: [Diseases]
 *     parameters:
 *       - in: query
 *         name: value
 *         schema:
 *           type: string
 *         description: Search value
 *         example: "Hyper"
 *     responses:
 *       200:
 *         description: Search results
 */
diseaseRouter.get("/search", async (req, res, next) => {
  try {
    const value = req.query.value as string;
    const output = await DiseaseSearchService(value);
    res.status(200).json({
      success: true,
      data: output,
    });
  } catch (error) {
    next(error);
  }
});
/**
 * @swagger
 * /api/v1/disease/:
 *   get:
 *     summary: Get disease by ID
 *     tags: [Diseases]
 *     parameters:
 *       - in: query
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Disease ID
 *         example: "1"
 *     responses:
 *       200:
 *         description: Disease details
 */
diseaseRouter.get("/", async (req, res, next) => {
  try {
    const StringId = req.query.id as string
    const id = parseInt(StringId)
    const data = await DiseaseDataByIdService(id)
    res.status(200).json({
      success: true,
      data: data
    })
  } catch (error) {
    next(error)
  }
})
export default diseaseRouter;

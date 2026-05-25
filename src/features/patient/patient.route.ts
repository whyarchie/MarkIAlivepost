import { Router } from "express";
import { getPatientAllDataController } from "./patient.controller";

const router = Router();

router.get("/:id/all", getPatientAllDataController);

export default router;
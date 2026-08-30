import express from "express";
import patientRouter from "./features/patient/patient.controller";
import diseaseRouter from "./features/disease/disease.controller";
import medicineRouter from "./features/medicine/medicine.controller";
import hospitalRouter from "./features/hospital/hospital.controller";
import doctorRouter from "./features/doctor/doctor.controller";
import dashboardRouter from "./features/other/dashboard/dashboard.controller";
import adminRouter from "./features/admin/admin.controller";
import chatRouter from "./features/chat/chat.controller";
const mainRouter = express.Router();

mainRouter.use("/patient", patientRouter);
mainRouter.use("/disease", diseaseRouter);
mainRouter.use("/medicine", medicineRouter);
mainRouter.use("/hospital",hospitalRouter);
mainRouter.use("/doctor", doctorRouter)
mainRouter.use("/dashboard", dashboardRouter);
mainRouter.use("/admin", adminRouter);
mainRouter.use("/chat", chatRouter);
export default mainRouter;

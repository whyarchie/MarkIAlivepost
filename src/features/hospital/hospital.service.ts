

import prisma from "../../config/prisma";
import { COMMON_ERROR, PATIENT_ERRORS } from "../../constants/messages";
import { AppError } from "../../utils/AppError";
import jwtTokenSigner from "../../utils/jwttokensigner";
import { HardDeletePatient } from "../patient/patient.service";
import type { HospitalCreate, HospitalLogin } from "./hospital.schema";
import bcrypt from "bcrypt"
export async function HospitalCreate(data:HospitalCreate){
    const hospital = await prisma.hospital.create({
        data:{
            name: data.name,
            helplineNumber: data.helplineNumber,
            address: data.address,
            userId: data.userId,
            password: data.password,
        },
        select:{
            id: true,
            name: true,
            helplineNumber:true,
            address:true,
            userId:true,
            createdAt: true,
      updatedAt: true
        }
    })
    return hospital;
}
export async function HospitalLogin(data: HospitalLogin) {
  const hospital = await prisma.hospital.findUnique({
    where: {
      userId: data.userId
    }
  })

  if (!hospital) {
    throw new AppError("Invalid userId or password", 401)
  }

  const verify = await bcrypt.compare(data.password, hospital.password)

  if (!verify) {
    throw new AppError("Invalid userId or password", 401)
  }

  const user = {
    id: hospital.id,
    role: "Hospital" 
  }

  const token = jwtTokenSigner(user)
  const {password, ...safeData}= hospital

  return {safeData, token}
}

//hospital search or debouncing 
export async function SearchHospital(name:string){
  const hospital = await prisma.hospital.findMany({
    where:{
      name:{
        contains:name,
        mode: "insensitive"
      }
    },
   select:{
    id: true, 
    name: true,
    helplineNumber: true,
    address: true,
   }
  })
  return hospital
}

//get hospital by id 
export async function GetHospitalById(id:number){
  const hospital = await prisma.hospital.findUnique({
    where:{
      id
    },
    select:{
    id: true, 
    name: true,
    helplineNumber: true,
    address: true,

    }
  })
  return hospital;
}

// get medicines of a patient for a hospital
export async function GetPatientMedicineForHospital(user: { id: number; role: string },patientId: number) {
  if (user?.role !== "Hospital") {
    throw new AppError(COMMON_ERROR.INVALID_ROLE, 403);
  }

  if (!patientId || isNaN(patientId)) {
    throw new AppError("Invalid patient id", 400);
  }

  const result = await prisma.medicineAllotted.findMany({
    where: {
      patientCondition: {
        hospitalId: user.id,
        patientId: patientId,
      },
    },
  });

  return result;
}

// A hospital removes a patient from its care.
// - A patient is "enrolled with" a hospital through their PatientCondition rows.
// - If the patient is enrolled with more than one hospital, we must NOT wipe the
//   whole patient — we only delete THIS hospital's conditions for them.
// - If this hospital is their only enrollment, the whole patient is deleted.
export async function HospitalDeletePatient(hospitalId: number, patientId: number) {
  // Every condition for this patient, with the hospital that owns it.
  const conditions = await prisma.patientCondition.findMany({
    where: { patientId },
    select: { id: true, hospitalId: true },
  });

  if (conditions.length === 0) {
    throw new AppError(PATIENT_ERRORS.INVALID_PATIENT, 404);
  }

  // A hospital may only delete a patient it actually treats.
  const ownsPatient = conditions.some((c) => c.hospitalId === hospitalId);
  if (!ownsPatient) {
    throw new AppError("This patient is not enrolled with your hospital", 403);
  }

  const distinctHospitals = new Set(conditions.map((c) => c.hospitalId)).size;

  // Enrolled with other hospitals too → only remove this hospital's enrollment.
  if (distinctHospitals > 1) {
    const { count } = await prisma.patientCondition.deleteMany({
      where: { patientId, hospitalId },
    });

    return {
      deleted: "conditions" as const,
      patientId,
      conditionsDeleted: count,
    };
  }

  // This hospital is the patient's only enrollment → delete the whole patient.
  const patient = await HardDeletePatient(patientId);

  return { deleted: "patient" as const, patient };
}
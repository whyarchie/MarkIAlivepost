import prisma from "../../config/prisma";
import { AppError } from "../../utils/AppError";
import jwtTokenSigner from "../../utils/jwttokensigner";
import type { AdminCreate, AdminLogin } from "./admin.schema";
import { GetFullPatientProfile, HardDeletePatient } from "../patient/patient.service";
import { COMMON_ERROR, PATIENT_ERRORS } from "../../constants/messages";
import bcrypt from "bcrypt";

export async function AdminCreate(data: AdminCreate) {
  const admin = await prisma.admin.create({
    data: {
      name: data.name,
      userId: data.userId,
      password: data.password,
    },
    select: {
      id: true,
      name: true,
      userId: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return admin;
}

export async function AdminLogin(data: AdminLogin) {
  const admin = await prisma.admin.findUnique({
    where: {
      userId: data.userId,
    },
  });

  if (!admin) {
    throw new AppError("Invalid userId or password", 401);
  }

  const verify = await bcrypt.compare(data.password, admin.password);

  if (!verify) {
    throw new AppError("Invalid userId or password", 401);
  }

  const user = {
    id: admin.id,
    role: "Admin",
  };

  const token = jwtTokenSigner(user);
  const { password, ...safeData } = admin;

  return { safeData, token };
}

// Look up a patient (with conditions + progress) by mobile number so the admin
// can pick a condition and a progress entry. Reuses the patient profile loader,
// which normalizes +91/91 prefixes and throws 404 if not found.
export async function AdminGetPatientByMobile(mobileNumber: string) {
  return GetFullPatientProfile({ mobileNumber });
}

// Write structured clinical data into a single PatientProgress.jsonField,
// optionally updating the follow-up status in the same write.
export async function AdminUpdateProgressJsonField(
  progressId: number,
  jsonField: unknown,
  followUpStatus?: string
) {
  const existing = await prisma.patientProgress.findUnique({
    where: { id: progressId },
    select: { id: true },
  });

  if (!existing) {
    throw new AppError("Progress entry not found", 404);
  }

  const updated = await prisma.patientProgress.update({
    where: { id: progressId },
    data: {
      jsonField: jsonField as any,
      ...(followUpStatus ? { followUpStatus: followUpStatus as any } : {}),
    },
    select: {
      id: true,
      patientConditionId: true,
      description: true,
      followUpStatus: true,
      scheduledDate: true,
      percentageRecovery: true,
      jsonField: true,
      createdAt: true,
    },
  });

  return updated;
}

// Admin can delete an entire patient (and all their conditions/history, which
// cascade). We verify the patient exists first so we can return a clean 404.
export async function AdminDeletePatient(patientId: number) {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { id: true, name: true },
  });

  if (!patient) {
    throw new AppError(PATIENT_ERRORS.INVALID_PATIENT, 404);
  }

  return HardDeletePatient(patientId);
}

// Admin can also delete a single patient condition. Its progress entries and
// allotted medicines are removed automatically via onDelete: Cascade.
export async function AdminDeletePatientCondition(patientConditionId: number) {
  const condition = await prisma.patientCondition.findUnique({
    where: { id: patientConditionId },
    select: { id: true },
  });

  if (!condition) {
    throw new AppError(COMMON_ERROR.INVALID_CONDITION, 404);
  }

  return prisma.patientCondition.delete({ where: { id: patientConditionId } });
}

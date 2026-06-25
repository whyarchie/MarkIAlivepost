import prisma from "../../config/prisma";
import { AppError } from "../../utils/AppError";
import jwtTokenSigner from "../../utils/jwttokensigner";
import type { AdminCreate, AdminLogin } from "./admin.schema";
import { GetFullPatientProfile } from "../patient/patient.service";
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

// Write structured clinical data into a single PatientProgress.jsonField.
export async function AdminUpdateProgressJsonField(
  progressId: number,
  jsonField: unknown
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
    data: { jsonField: jsonField as any },
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

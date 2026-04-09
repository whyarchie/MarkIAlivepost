import prisma from "../../config/prisma";
import type {
  AssignMedicineInput,
  CreateprogressInput,
  MedicalHistoryCreate,
  PatientConditionInput,
  PatientInput,
  PatientLoginInput,
} from "./patient.schema";
import { COMMON_ERROR, error, PATIENT_ERRORS } from "../../constants/messages";
import { AppError } from "../../utils/AppError";
import jwtTokenSigner from "../../utils/jwttokensigner";

export async function CreatePatient(data: PatientInput) {
  const patient = await prisma.patient.upsert({
    where: { mobileNumber: data.mobileNumber },
    update: {},
    create: {
      name: data.name,
      dateOfBirth: new Date(data.dateOfBirth), // ensure it's a Date object
      bloodGroup: data.bloodGroup,
      gender: data.gender,
      mobileNumber: data.mobileNumber,
    },
  });
  return patient;
}

export async function SearchPatientByMobile(mobileNumber: string, hospitalId: number) {
  // Normalize: strip +91 or 91 prefix
  const digits = mobileNumber.trim().replace(/\D/g, "");
  const normalized = digits.startsWith("91") && digits.length === 12 ? digits.slice(2) : digits;

  const patient = await prisma.patient.findUnique({
    where: { mobileNumber: normalized },
    include: {
      medicalHistory: {
        include: { disease: true },
        orderBy: { startDate: "desc" },
      },
      conditions: {
        where: { hospitalId },
        include: {
          disease: true,
          hospital: true,
          doctor: true,
          medicineAlloted: {
            include: {
              medicine: true,
              timings: true,
            },
          },
          patientProgress: true,
        },
        orderBy: { startDate: "desc" },
      },
    },
  });
  if (!patient) {
    throw new AppError("Patient not found with this mobile number", 404);
  }

  return patient;
}

//Login patient using mobile number and dateofBirth
export async function LoginPatient(data: PatientLoginInput) {
  const patient = await prisma.patient.findUnique({
    where: { mobileNumber: data.mobileNumber },
  });
  if (!patient) {
    throw new AppError(error.INVALID_CREDENTIALS, 401);
  }
  if (patient.dateOfBirth.toISOString() !== data.dateOfBirth.toISOString()) {
    throw new AppError(error.INVALID_CREDENTIALS, 401);
  }
  const user = {
    id: patient.id,
    role: "Patient"
  }
  const token = jwtTokenSigner(user)
  return { patient, token };
}

//Delete Patient service

export async function DeletePatientService(id: number | undefined) {
  if (!id) {
    throw new AppError(COMMON_ERROR.ID_NOT_FOUND, 404);
  }
  try {
    const patient = await prisma.patient.delete({
      where: {
        id: id,
      },
    });

    return patient;
  } catch (error: any) {
    // Record not found
    if (error.code === "P2025") {
      throw new AppError(PATIENT_ERRORS.INVALID_PATIENT, 404);
    }

    // Foreign key constraint
    if (error.code === "P2003") {
      throw new AppError(COMMON_ERROR.FOREIGN_KEY_CONSTRAINT, 400);
    }

    throw error; // unknown error
  }
}
//Medical history create for patient
export async function MedicalHistoryCreateService(data: MedicalHistoryCreate) {
  try {
    return await prisma.medicalHistory.create({
      data: {
        diseaseId: data.diseaseId,
        description: data.description,
        startDate: data.startDate,
        endDate: data.endDate,
        patientId: data.patientId,
      },
    });
  } catch (error: any) {
    if (error.code === "P2003") {
      const field = error.meta?.field_name;

      if (field?.includes("patientId")) {
        throw new AppError(PATIENT_ERRORS.INVALID_PATIENT, 404);
      }

      if (field?.includes("diseaseId")) {
        throw new AppError(COMMON_ERROR.INVALID_DISEASE, 404);
      }
    }

    throw error;
  }
}
export async function PatientConditionCreate(data: PatientConditionInput) {
  try {
    const patientCondition = await prisma.patientCondition.create({
      data: {
        patientId: data.patientId,
        hospitalId: data.hospitalId,
        doctorId: data.doctorId,
        diseaseId: data.diseaseId,
        startDate: data.startDate,
        endDate: data.endDate,
        status: data.status,
      },
    });
    return patientCondition;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error) {
      const prismaError = error as {
        code?: string;
        meta?: { field_name?: string };
      };

      if (prismaError.code === "P2003") {
        const field = prismaError.meta?.field_name;

        if (field?.includes("patientId")) {
          throw new AppError(PATIENT_ERRORS.INVALID_PATIENT, 404);
        }

        if (field?.includes("diseaseId")) {
          throw new AppError(COMMON_ERROR.INVALID_DISEASE, 404);
        }

        if (field?.includes("doctorId")) {
          throw new AppError(COMMON_ERROR.INVALID_DOCTOR, 404);
        }

        if (field?.includes("hospitalId")) {
          throw new AppError(COMMON_ERROR.INVALID_HOSPITAL, 404);
        }
      }

      throw new AppError(
        "Database error while creating patient condition",
        500,
      );
    }

    throw error;
  }
}
export async function PatientConditionGet({
  user,
  safeId,
}: {
  user: { id: number; role: string };
  safeId: number;
}) {
  const where: any = { id: safeId };

  if (user.role === "Patient") where.patientId = user.id;
  if (user.role === "Hospital") where.hospitalId = user.id;
  if (user.role === "Doctor") where.doctorId = user.id;

  const condition = await prisma.patientCondition.findMany({ where });

  if (!condition) {
    throw new AppError("Condition not found or unauthorized", 404);
  }

  return condition;
}
export async function AssignMedicine(data: AssignMedicineInput, user: { id: number, role: string }) {

  const condition = await prisma.patientCondition.findUnique({
    where: {
      id: data.patientConditionId
    }
  })

  if (!condition) {
    throw new AppError("Patient condition not found", 404)
  }

  if (condition.hospitalId !== user.id) {
    throw new AppError("Unauthorized to modify this condition", 403)
  }

  const result = await prisma.$transaction(async (tx) => {

    const created = []

    for (const med of data.medicines) {

      const medicine = await tx.medicineAllotted.create({
        data: {
          patientConditionId: data.patientConditionId,
          medicineId: med.medicineId,
          quantity: med.quantity,
          tillDate: med.tillDate,

          timings: {
            create: med.timings.map((time) => ({
              timing: new Date(`1970-01-01T${time}`)
            }))
          }
        },

        include: {
          medicine: true,
          timings: true
        }
      })

      created.push(medicine)
    }

    return created
  })

  return result
}

export async function GetAssignedMedicineForPatient(id: number) {

  const result = await prisma.medicineAllotted.findMany({
    where: {
      patientCondition: {
        patientId: id
      }
    },
    include: {
      medicine: true,
      timings: true,
      patientCondition: {
        include: {
          disease: true
        }
      }
    }
  })

  return result
}

export async function CreatePatientProgress(data: CreateprogressInput & { hospitalId: number }) {
  const patientCondition = await prisma.patientCondition.findFirst({
    where: {
      id: data.patientConditionId,
      hospitalId: data.hospitalId
    }
  })
  if (!patientCondition) {
    throw new AppError(COMMON_ERROR.INVALID_HOSPITAL, 403)
  }
  const safeData = []
  const baseDate = new Date(data.startDate)

  for (let i = 0; i < data.totalOccurrences; i++) {
    const date = new Date(baseDate)
    date.setDate(baseDate.getDate() + i * data.frequency)

    safeData.push({
      patientConditionId: data.patientConditionId,
      scheduledDate: date,
      questions: data.questions,
    })
  }

  const result = await prisma.patientProgress.createMany({
    data: safeData,

    skipDuplicates: true, // optional but safer in scheduling systems
  })
  return result
}

export async function GetPatientForHostpital(data: { patientConditionId: number, hospitalId: number }) {
  const result = await prisma.patientProgress.findMany({
    where: {
      patientConditionId: data.patientConditionId,
      patientCondition: {
        hospitalId: data.hospitalId
      }
    }
  })
  return result

}

export async function GetPatientProgressForPatient(id: number) {
  const result = await prisma.patientProgress.findMany({
    where: {
      patientCondition: {
        patientId: id
      }
    }
  })
  return result
}

export async function SavePatientFcmToken({ patientId, fcmToken }: { patientId: number, fcmToken: string }) {
  const data = await prisma.patientDevice.upsert({
    where: { fcmToken },
    update: { patientId },
    create: { patientId, fcmToken }
  })
  return data
}
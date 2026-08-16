import prisma from "../../config/prisma";
import type {
  AssignMedicineInput,
  CreateprogressInput,
  MedicalHistoryCreate,
  PatientConditionInput,
  PatientInput,
  PatientLoginInput,
  PatientDeleteInput,
  PatientMedicineStatusInput,
} from "./patient.schema";
import { COMMON_ERROR, error, PATIENT_ERRORS } from "../../constants/messages";
import { AppError } from "../../utils/AppError";
import jwtTokenSigner from "../../utils/jwttokensigner";
import { UserSummarySystemPrompt, parsePatientSummary, buildRecoveryTrajectory } from "../../prompt/patientSummary";
import OpenRouterAi from "../../utils/openrouter_ai";

export async function CreatePatient(data: PatientInput) {
  const patient = await prisma.patient.upsert({
    where: { mobileNumber: data.mobileNumber },
    update: {},
    create: {
      name: data.name,
      dateOfBirth: new Date(data.dateOfBirth),
      bloodGroup: data.bloodGroup,
      gender: data.gender,
      mobileNumber: data.mobileNumber,
      idType: data.idType,
      idNumber: data.idNumber,
    },
  });
  return patient;
}

export async function SearchPatientByMobile(mobileNumber: string, hospitalId: number) {
  return GetFullPatientProfile({ mobileNumber, hospitalId });
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

// Permanently delete a patient and everything that hangs off them.
// PatientCondition and MedicalHistory are removed automatically via onDelete:
// Cascade, but PatientDevice has no cascade rule, so we clear its rows first —
// all inside one transaction so a failure leaves nothing half-deleted.
export async function HardDeletePatient(patientId: number) {
  return prisma.$transaction(async (tx) => {
    await tx.patientDevice.deleteMany({ where: { patientId } });
    return tx.patient.delete({ where: { id: patientId } });
  });
}

//Delete Patient service

export async function DeletePatientService(
  id: number | undefined,
  credentials: PatientDeleteInput
) {
  if (!id) {
    throw new AppError(COMMON_ERROR.ID_NOT_FOUND, 404);
  }

  // Verify the user before deleting: the account identified by the token must
  // exist AND the re-submitted identity (mobile + date of birth) must match it.
  const patient = await prisma.patient.findUnique({ where: { id } });

  if (!patient) {
    throw new AppError(PATIENT_ERRORS.INVALID_PATIENT, 404);
  }

  const identityMatches =
    patient.mobileNumber === credentials.mobileNumber &&
    patient.dateOfBirth.toISOString() === credentials.dateOfBirth.toISOString();

  if (!identityMatches) {
    throw new AppError(error.INVALID_CREDENTIALS, 401);
  }

  try {
    const deleted = await HardDeletePatient(id);

    return deleted;
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
// Whole days a patient is enrolled for, counting both the start and the end
// date (1 Jan → 10 Jan = 10 days). Open-ended enrollments (no end date) are
// charged for a single day up front.
function enrollmentDays(startDate: Date, endDate?: Date | null) {
  if (!endDate) return 1;
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.max(
    1,
    Math.floor((endDate.getTime() - startDate.getTime()) / MS_PER_DAY) + 1,
  );
}

export async function PatientConditionCreate(data: PatientConditionInput) {
  // Enrolling a patient costs the hospital perDayPatientCost (rupees) for each
  // enrolled day, deducted from its wallet. The wallet balance is in paise.
  const hospital = await prisma.hospital.findUnique({
    where: { id: data.hospitalId },
    select: { perDayPatientCost: true },
  });

  if (!hospital) {
    throw new AppError(COMMON_ERROR.INVALID_HOSPITAL, 404);
  }

  const days = enrollmentDays(data.startDate, data.endDate);
  const totalRupees = days * hospital.perDayPatientCost;
  const totalPaise = totalRupees * 100;
  // Only half of the quoted enrollment cost is deducted up front.
  const chargePaise = totalPaise / 2;

  try {
    return await prisma.$transaction(async (tx) => {
      // Conditional decrement: only matches while balance >= charge, so
      // concurrent enrollments can't drive the wallet negative.
      const charged = await tx.hospital.updateMany({
        where: { id: data.hospitalId, balance: { gte: chargePaise } },
        data: { balance: { decrement: chargePaise } },
      });

      if (charged.count === 0) {
        throw new AppError(
          `Insufficient wallet balance: enrolling this patient for ${days} day(s) costs ₹${totalRupees}, of which half (₹${chargePaise / 100}) is deducted up front. Please top up the wallet and try again.`,
          402,
        );
      }

      const patientCondition = await tx.patientCondition.create({
        data: {
          patientId: data.patientId,
          hospitalId: data.hospitalId,
          HospitalPatientId: data.hostpitalPatientId,
          doctorId: data.doctorId,
          diseaseId: data.diseaseId,
          startDate: data.startDate,
          endDate: data.endDate,
          status: data.status,
        },
      });

      const wallet = await tx.hospital.findUnique({
        where: { id: data.hospitalId },
        select: { balance: true },
      });

      return {
        ...patientCondition,
        billing: {
          days,
          perDayPatientCost: hospital.perDayPatientCost, // rupees/day
          totalCost: totalPaise, // full enrollment cost, paise
          charged: chargePaise, // half of totalCost, deducted now (paise)
          balance: wallet?.balance ?? 0, // paise
        },
      };
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
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
      MedicineStatus: true,
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

export async function GetQuestionForToday(userid: number) {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const pending = await prisma.patientProgress.findMany({
      where: {
        patientCondition: {
          patientId: userid,
        },
        scheduledDate: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });

    return pending;
  } catch (error) {
    console.error("GetQuestionForToday failed:", error);
    throw error; // let the caller handle it
  }
}


type SavePatientAnswerInput = {
  patientProgress: number;
  patientId: number;
  answer: Array<{ question: string, answer: string }>;
};
export async function SavePatientAnswer({ patientProgress, patientId, answer }: SavePatientAnswerInput) {
  try {
    const verify = await prisma.patientProgress.findUnique({
      where: {
        id: patientProgress,
        patientCondition: {
          patientId: patientId
        }
      }
    })
    if (!verify) {
      throw new AppError("Data mismatch!!", 403)
    }
    const data = await prisma.patientProgress.update({
      where: {
        id: patientProgress
      },
      data: {
        answer: answer,
        followUpStatus: "SUCCESSFUL",
      }
    })

    return data;
  } catch (error) {
    throw error
  }
}

export async function PatientMedicineStatus(data: PatientMedicineStatusInput, patientId: number) {
  try {
    const count = await prisma.medicineAllotted.count({
      where: {
        id: { in: data.medicineAllotedId },
        patientCondition: {
          patientId: patientId
        }
      }
    });

    if (count !== data.medicineAllotedId.length) {
      throw new AppError("Unauthorized or invalid medicine allotment IDs", 403);
    }

    const result = await prisma.medicineStatus.create({
      data: {
        medicineTaken: data.medicineTaken,
        remark: data.remark,
        medicineAlloted: {
          connect: data.medicineAllotedId.map((id) => ({ id }))
        }
      }
    });
    console.log(result);
    return result;
  } catch (error) {
    throw error;
  }
}

export async function GetPatientProfile(patientId: number) {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    include: {
      medicalHistory: {
        include: {
          disease: true,
        },
      },
      conditions: {
        include: {
          disease: true,
          hospital: {
            select: {
              id: true,
              name: true,
              helplineNumber: true,
              address: true,
              userId: true,
            },
          },
          doctor: true,
          medicineAlloted: {
            include: {
              medicine: true,
              timings: true,
              MedicineStatus: true,
            },
          },
          patientProgress: true,
        },
      },
    },
  });

  if (!patient) {
    throw new AppError("Patient not found", 404);
  }

  return patient;
}

export async function GetAnsweredProgressForPatient(patientId: number) {
  const result = await prisma.patientProgress.findMany({
    where: {
      patientCondition: {
        patientId: patientId
      }
    },
    include: {
      patientCondition: {
        include: {
          disease: true
        }
      }
    },
    orderBy: {
      scheduledDate: 'desc'
    }
  });

  return result.filter(item => item.answer !== null && item.answer !== undefined);
}

export async function GetAllPatientsForHospital(hospitalId: number, page: number, limit: number) {
  const skip = (page - 1) * limit;

  const [patients, totalCount] = await Promise.all([
    prisma.patient.findMany({
      where: {
        conditions: {
          some: { hospitalId },
        },
      },
      include: {
        conditions: {
          where: { hospitalId },
          include: {
            disease: true,
            doctor: true,
          },
          orderBy: { startDate: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),

    prisma.patient.count({
      where: {
        conditions: {
          some: { hospitalId },
        },
      },
    }),
  ]);

  return {
    patients,
    pagination: {
      total: totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
    },
  };
}

export async function GetHighRiskPatientsForHospital(hospitalId: number, page: number, limit: number) {
  const skip = (page - 1) * limit;

  const [patients, totalCount] = await Promise.all([
    prisma.patient.findMany({
      where: {
        conditions: {
          some: {
            hospitalId,
            status: "CRITICAL",
          },
        },
      },
      include: {
        conditions: {
          where: { hospitalId },
          include: {
            disease: true,
            doctor: true,
          },
          orderBy: { startDate: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),

    prisma.patient.count({
      where: {
        conditions: {
          some: {
            hospitalId,
            status: "CRITICAL",
          },
        },
      },
    }),
  ]);

  return {
    patients,
    pagination: {
      total: totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
    },
  };
}


/**
 * Patient profile with its related clinical data.
 * Excludes: Hospital.password, PatientDevice.fcmToken
 *
 * Lookup by patientId OR mobileNumber. When hospitalId is provided, the
 * patient must be enrolled with that hospital and only its conditions return.
 */
export async function GetFullPatientProfile({
  patientId,
  mobileNumber,
  hospitalId,
}: {
  patientId?: number;
  mobileNumber?: string;
  hospitalId?: number;
}) {
  if (!patientId && !mobileNumber) {
    throw new AppError("Patient ID or mobile number is required", 400);
  }

  // Normalize mobile: strip +91 or 91 prefix
  let normalizedMobile: string | undefined;
  if (mobileNumber) {
    const digits = mobileNumber.trim().replace(/\D/g, "");
    normalizedMobile = digits.startsWith("91") && digits.length === 12 ? digits.slice(2) : digits;
  }

  const patientIdentifier = patientId
    ? { id: patientId }
    : { mobileNumber: normalizedMobile! };

  const patient = await prisma.patient.findFirst({
    where: {
      ...patientIdentifier,
      // Filtering the included conditions is not sufficient authorization: it
      // would still return the rest of an unrelated patient's profile. Require
      // an actual relationship whenever a hospital is performing the lookup.
      ...(hospitalId !== undefined
        ? { conditions: { some: { hospitalId } } }
        : {}),
    },
    include: {
      medicalHistory: {
        include: {
          disease: true,
        },
        orderBy: { startDate: "desc" },
      },
      conditions: {
        ...(hospitalId !== undefined ? { where: { hospitalId } } : {}),
        include: {
          disease: true,
          hospital: {
            select: {
              id: true,
              name: true,
              helplineNumber: true,
              address: true,
              userId: true,
              createdAt: true,
              updatedAt: true,
            },
          },
          doctor: {
            select: {
              id: true,
              name: true,
              username: true,
              hospitalId: true,
              createdAt: true,
              updatedAt: true,
            },
          },
          medicineAlloted: {
            include: {
              medicine: true,
              timings: true,
              MedicineStatus: true,
            },
          },
          patientProgress: {
            orderBy: { scheduledDate: "desc" },
          },
        },
        orderBy: { startDate: "desc" },
      },
    },
  });

  if (!patient) {
    throw new AppError("Patient not found", 404);
  }

  return patient;
}

export async function GetPatientSummary(id: number, hospitalId?: number) {
  const patientProfile = await GetFullPatientProfile({ patientId: id, hospitalId })
  const raw = await OpenRouterAi({
    SystemPrompt: UserSummarySystemPrompt,
    Prompt: `Patient Profile: ${JSON.stringify(patientProfile)}`
  })
  // The model returns structured JSON; the recovery trajectory is computed from
  // the DB so the chart is always accurate regardless of model fidelity.
  return {
    ...parsePatientSummary(raw),
    recoveryTrajectory: buildRecoveryTrajectory(patientProfile),
  }
}

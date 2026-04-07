import { z } from "zod";
import { COMMON_ERROR, PATIENT_ERRORS } from "../../constants/messages";

const normalizeMobile = (mobile: string): string => {
  const digits = mobile.trim().replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) {
    return digits.slice(2);
  }
  return digits;
};
export const patientSchema = z.object({
  name: z
    .string()
    .trim()                                    // 👈 "  John  " → "John"
    .min(1, { message: PATIENT_ERRORS.NAME_REQUIRED }),

  dateOfBirth: z.coerce
    .date({ message: PATIENT_ERRORS.DOB_INVALID })
    .refine((date) => !isNaN(date.getTime()), {  // 👈 catches "banana" → Invalid Date
      message: PATIENT_ERRORS.DOB_INVALID,
    })
    .refine((date) => date < new Date(), {
      message: PATIENT_ERRORS.DOB_FUTURE,
    }),

  bloodGroup: z.enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"], {
    message: PATIENT_ERRORS.BLOODGROUP_INVALID,
  }),

  gender: z.enum(["MALE", "FEMALE", "OTHER"], {
    message: PATIENT_ERRORS.GENDER_INVALID,
  }),

  mobileNumber: z
    .string()
    .trim()
    .regex(/^(?:\+91|91)?[6-9]\d{9}$/, {
      message: PATIENT_ERRORS.MOBILE_INVALID,
    })
    .transform(normalizeMobile),               // 👈 same fix, consistent with login
});


export const patientLoginSchema = z.object({
  mobileNumber: z
    .string()
    .trim()
    .regex(/^(?:\+91|91)?[6-9]\d{9}$/, {
      message: PATIENT_ERRORS.MOBILE_INVALID,
    })
    .transform(normalizeMobile),  // 👈 normalize after validation passes

  dateOfBirth: z.coerce
    .date({ message: PATIENT_ERRORS.DOB_INVALID })
    .refine((date) => date < new Date(), {
      message: PATIENT_ERRORS.DOB_FUTURE,
    }),
});

// Medical History

export const medicalHistorySchema = z
  .object({
    diseaseId: z
      .number({ message: PATIENT_ERRORS.DISEASE_ID_REQUIRE })
      .int()
      .positive(),

    patientId: z
      .number({ message: PATIENT_ERRORS.PATIENT_ID_REQUIRE })
      .int()
      .positive(),

    description: z
      .string()
      .trim()
      .max(1500, { message: COMMON_ERROR.DESCRIPTION_TOO_LONG })
      .optional(),

    startDate: z.coerce.date({ message: COMMON_ERROR.STARTDATE_REQUIRE }),

    endDate: z.coerce.date().optional(),
  })
  .refine((data) => !data.endDate || data.endDate >= data.startDate, {
    message: COMMON_ERROR.ENDDATE_BEFORE_START,
    path: ["endDate"],
  });

//PatientConditionSchema
export const PatientConditionSchema = z
  .object({
    patientId: z
      .number()
      .int()
      .positive({ message: PATIENT_ERRORS.INVALID_PATIENT }),

    diseaseId: z
      .number()
      .int()
      .positive({ message: COMMON_ERROR.INVALID_DISEASE }),
    hospitalId: z
      .number()
      .int()
      .positive({ message: COMMON_ERROR.INVALID_HOSPITAL }),
    doctorId: z
      .number()
      .int()
      .positive({ message: COMMON_ERROR.INVALID_DOCTOR })
      .optional(),
    status: z.enum(["STABLE", "CRITICAL", "RECOVERED"]),

    startDate: z.coerce.date({
      message: COMMON_ERROR.STARTDATE_REQUIRE,
    }),

    endDate: z.coerce.date().optional(),
  })
  .refine((data) => !data.endDate || data.endDate >= data.startDate, {
    message: COMMON_ERROR.ENDDATE_BEFORE_START,
    path: ["endDate"],
  });

export const AssignMedicineSchema = z.object({
  patientConditionId: z.number().int().positive(),
  medicines: z
    .array(
      z.object({
        medicineId: z.number().int().positive(),

        quantity: z.number().int().positive().default(1),

        tillDate: z.coerce.date(),

        timings: z
          .array(
            z
              .string()
              .regex(
                /^([01]\d|2[0-3]):([0-5]\d)$/,
                "Invalid time format (HH:mm)",
              ),
          )
          .min(1, "At least one timing required")
          .max(10),
      }),
    )
    .min(1, "At least one medicine required")
    .max(20),
});

export const CreateprogressSchema = z.object({
  patientConditionId: z.number({
    message: COMMON_ERROR.INVALID_NUMBER,
  }),
  frequency: z
    .number({
      message: COMMON_ERROR.INVALID_NUMBER,
    })
    .min(1, COMMON_ERROR.INVALID_FREQ),

  totalOccurrences: z
    .number({
      message: COMMON_ERROR.INVALID_NUMBER,
    })
    .min(1, COMMON_ERROR.INVALID_NUMBER),

  questions: z
    .string({
      message: COMMON_ERROR.INVALID_STRING,
    })
    .min(1, COMMON_ERROR.EMPTY_STRING),

  startDate: z.string({
    message: COMMON_ERROR.STARTDATE_REQUIRE
  }),
})
export type PatientLoginInput = z.infer<typeof patientLoginSchema>;
export type PatientInput = z.infer<typeof patientSchema>;
export type MedicalHistoryCreate = z.infer<typeof medicalHistorySchema>;
export type PatientConditionInput = z.infer<typeof PatientConditionSchema>;
export type AssignMedicineInput = z.infer<typeof AssignMedicineSchema>;
export type CreateprogressInput = z.infer<typeof CreateprogressSchema>
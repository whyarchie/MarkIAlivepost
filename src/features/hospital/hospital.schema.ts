
import z from "zod";

export const HospitalSchema = z.object({
  name: z
    .string()
    .min(2, "Hospital name must be at least 2 characters")
    .max(120, "Hospital name too long")
    .trim(),

  helplineNumber: z
    .string()
    .regex(/^[0-9]{10,15}$/, "Helpline number must be 10–15 digits"),

  address: z
    .string()
    .min(10, "Address must be at least 10 characters")
    .max(255)
    .trim(),

  userId: z
    .string()
    .min(4, "User ID must be at least 4 characters")
    .max(50)
    .regex(/^[a-zA-Z0-9_]+$/, "User ID can contain only letters, numbers and underscores"),

  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(50)
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
})

export const HospitalLoginSchema = z.object({
    userId: z
    .string()
    .min(4, "User ID must be at least 4 characters")
    .max(50),

  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(50)
})
// A hospital removes a patient it treats. Depending on whether the patient is
// also enrolled with other hospitals, this deletes either just this hospital's
// patient conditions or the whole patient (decided in the service).
export const HospitalDeletePatientSchema = z.object({
  patientId: z.coerce
    .number({ message: "patientId is required" })
    .int("patientId must be an integer")
    .positive("patientId must be a positive integer"),
})

export type HospitalCreate = z.infer<typeof HospitalSchema>
export type HospitalLogin = z.infer<typeof HospitalLoginSchema>
export type HospitalDeletePatient = z.infer<typeof HospitalDeletePatientSchema>
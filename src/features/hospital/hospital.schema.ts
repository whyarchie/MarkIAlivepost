
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

  // Personal/billing contact number used to prefill the Razorpay checkout.
  // Required, same 10–15 digit format as the helpline.
  contactNumber: z
    .string()
    .regex(/^[0-9]{10,15}$/, "Contact number must be 10–15 digits"),

  email: z
    .string()
    .email("Invalid email address")
    .max(255)
    .trim(),

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
    .regex(/[0-9]/, "Password must contain at least one number"),

  // Amount (in rupees) charged to the hospital's wallet for each day a patient
  // is enrolled. Optional on create — the DB defaults it to ₹100/day.
  perDayPatientCost: z.coerce
    .number()
    .int("Per-day patient cost must be a whole number")
    .positive("Per-day patient cost must be greater than zero")
    .max(1_000_000, "Per-day patient cost is too large")
    .optional(),
})

// Admin updates a hospital's profile/pricing. hospitalId selects the hospital;
// every other field is optional — only the ones provided are changed.
export const HospitalUpdateSchema = z
  .object({
    hospitalId: z.coerce
      .number({ message: "hospitalId is required" })
      .int("hospitalId must be an integer")
      .positive("hospitalId must be a positive integer"),

    name: HospitalSchema.shape.name.optional(),
    helplineNumber: HospitalSchema.shape.helplineNumber.optional(),
    contactNumber: HospitalSchema.shape.contactNumber.optional(),
    email: HospitalSchema.shape.email.optional(),
    address: HospitalSchema.shape.address.optional(),
    userId: HospitalSchema.shape.userId.optional(),
    password: HospitalSchema.shape.password.optional(),
    perDayPatientCost: HospitalSchema.shape.perDayPatientCost,
  })
  .refine(
    (data) =>
      Object.entries(data).some(
        ([key, value]) => key !== "hospitalId" && value !== undefined,
      ),
    { message: "Provide at least one field to update" },
  )

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

// A hospital fills/updates the invoice-facing notes on one of its patient
// conditions: the doctor's recommendation and the invoice instructions that get
// printed on the downloadable patient invoice. Both are optional individually,
// but at least one must be provided. Empty string clears a note.
export const HospitalConditionRecommendationSchema = z
  .object({
    conditionId: z.coerce
      .number({ message: "conditionId is required" })
      .int("conditionId must be an integer")
      .positive("conditionId must be a positive integer"),

    doctorRecommendation: z
      .string()
      .max(2000, "Doctor recommendation is too long")
      .trim()
      .optional(),

    invoiceRecommendation: z
      .string()
      .max(2000, "Invoice instructions are too long")
      .trim()
      .optional(),
  })
  .refine(
    (data) =>
      data.doctorRecommendation !== undefined ||
      data.invoiceRecommendation !== undefined,
    { message: "Provide doctorRecommendation and/or invoiceRecommendation" },
  )

// Fields returned by the Razorpay checkout handler, sent back so the server can
// verify the payment signature and credit the hospital's balance.
export const HospitalVerifyPaymentSchema = z.object({
  razorpay_order_id: z.string().min(1, "razorpay_order_id is required"),
  razorpay_payment_id: z.string().min(1, "razorpay_payment_id is required"),
  razorpay_signature: z.string().min(1, "razorpay_signature is required"),
})

export type HospitalCreate = z.infer<typeof HospitalSchema>
export type HospitalUpdate = z.infer<typeof HospitalUpdateSchema>
export type HospitalLogin = z.infer<typeof HospitalLoginSchema>
export type HospitalDeletePatient = z.infer<typeof HospitalDeletePatientSchema>
export type HospitalVerifyPayment = z.infer<typeof HospitalVerifyPaymentSchema>
export type HospitalConditionRecommendation = z.infer<typeof HospitalConditionRecommendationSchema>
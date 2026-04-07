import { z } from "zod";
export const MedicineSchema = z.object({
  brandName: z.string().min(2).max(100),
  genericName: z.string().min(2).max(100),
  dosageForm: z.enum([
    "TABLET",
    "CAPSULE",
    "SYRUP",
    "INJECTION",
    "OINTMENT",
    "DROPS",
    "CREAM",
    "GEL",
    "INHALER",
    "POWDER",
  ]),
  dosageStrength: z.string().min(2).max(20).optional(),
  manufacturer: z.string().min(2).max(100),
});
export type MedicineCreateSchema = z.infer<typeof MedicineSchema>
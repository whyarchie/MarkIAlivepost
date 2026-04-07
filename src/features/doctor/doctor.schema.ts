import z from "zod"

export const DoctorSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Doctor name must be at least 2 characters")
    .max(60, "Doctor name cannot exceed 60 characters"),

  username: z
    .string()
    .trim()
    .min(4, "Username must be at least 4 characters")
    .max(30, "Username too long")
    .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"),

  hospitalId: z
    .number()
    .int("Hospital ID must be an integer")
    .positive("Hospital ID must be positive")
});
export type DoctorSchemaCreate = z.infer<typeof DoctorSchema>
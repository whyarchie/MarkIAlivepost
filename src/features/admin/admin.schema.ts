import z from "zod";

export const AdminSchema = z.object({
  name: z
    .string()
    .min(2, "Admin name must be at least 2 characters")
    .max(120, "Admin name too long")
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
});

export const AdminLoginSchema = z.object({
  userId: z
    .string()
    .min(4, "User ID must be at least 4 characters")
    .max(50),

  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(50),
});

// Admin writes structured clinical data into a PatientProgress.jsonField.
// jsonField must be a JSON object or array (not a primitive/null), which also
// sidesteps Prisma's NULL-on-Json handling.
const jsonObjectOrArray = z.union(
  [z.record(z.string(), z.any()), z.array(z.any())],
  { message: "jsonField must be a JSON object or array" }
);

export const AdminProgressJsonSchema = z.object({
  progressId: z.coerce
    .number({ message: "progressId is required" })
    .int("progressId must be an integer")
    .positive("progressId must be a positive integer"),
  jsonField: jsonObjectOrArray,
});

export type AdminCreate = z.infer<typeof AdminSchema>;
export type AdminLogin = z.infer<typeof AdminLoginSchema>;
export type AdminProgressJson = z.infer<typeof AdminProgressJsonSchema>;

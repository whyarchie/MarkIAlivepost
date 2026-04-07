import {z} from "zod";

export const diseaseSchema = z.object({
    name: z.string(),
    type: z.enum(["CHRONIC", "ACUTE"]),
    description: z.string().optional(),
})

export type DiseaseCreateSchema = z.infer<typeof diseaseSchema>
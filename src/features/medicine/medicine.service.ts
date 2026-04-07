import prisma from "../../config/prisma";
import type { MedicineCreateSchema } from "./medicine.schema";

export async function CreateMedicine(data: MedicineCreateSchema) {
  try {
    const medicine = await prisma.medicine.create({
      data,
    });

    return medicine;
  } catch (error) {
    console.log(error);
    throw error;
  }
}

export async function MedicineSearch(value: string) {
  const medicine = await prisma.medicine.findMany({
    where: {
      OR: [
        { brandName: { contains: value, mode: "insensitive" } },
        { genericName: { contains: value, mode: "insensitive" } },
        { manufacturer: { contains: value, mode: "insensitive" } },
      ],
    },
  });
  return medicine;
}

export async function MedicineDetail(id:number){
    const medicine = await prisma.medicine.findUnique({
        where:{
            id
        }
    })
    return medicine
}

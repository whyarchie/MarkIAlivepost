import prisma from "../../config/prisma";
import { COMMON_ERROR } from "../../constants/messages";
import { AppError } from "../../utils/AppError";
import type { DoctorSchemaCreate } from "./doctor.schema";

export async function CreateDoctor(data: DoctorSchemaCreate) {
  const doctor = await prisma.doctor.create({
    data: {
      name: data.name,
      username: data.username,
      hospitalId: data.hospitalId,
    },
    select: {
      id: true,
      name: true,
      username: true,
    },
  });
  return doctor;
}

export async function GetDoctorByHostpialId(id: number) {
  const result = await prisma.doctor.findMany({
    where: {
      id,
    },
    select: {
      id: true,
      name: true,
      username: true,
    },
  });
  return result;
}

export async function SearchDoctorForHospital({
  name,
  id,
}: {
  name: string;
  id: number;
}) {
  const result = await prisma.doctor.findMany({
    where: {
  
        hospitalId: id,
        name: {
          contains: name,
          mode: "insensitive",
        },
    },
  });
  return result;
}

export async function getDoctorInformation({id,hospitalId}:{id:number, hospitalId: number}){
  const doctor = await prisma.doctor.findUnique({
    where:{
      id,
      hospitalId
    },
    select:{
      id:true,
      name: true,
      patientConditions:{
        select:{
          patient: {
            select:{
              id: true,
              name: true
            }
          }
        }
      }
    }
  })
  if(!doctor){
    throw new AppError(COMMON_ERROR.INVALID_DOCTOR , 404)
  }
  return doctor
}

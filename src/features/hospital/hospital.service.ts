

import prisma from "../../config/prisma";
import { COMMON_ERROR } from "../../constants/messages";
import { AppError } from "../../utils/AppError";
import jwtTokenSigner from "../../utils/jwttokensigner";
import type { HospitalCreate, HospitalLogin } from "./hospital.schema";
import bcrypt from "bcrypt"
export async function HospitalCreate(data:HospitalCreate){
    const hospital = await prisma.hospital.create({
        data:{
            name: data.name,
            helplineNumber: data.helplineNumber,
            address: data.address,
            userId: data.userId,
            password: data.password,
        },
        select:{
            id: true,
            name: true,
            helplineNumber:true,
            address:true,
            userId:true,
            createdAt: true,
      updatedAt: true
        }
    })
    return hospital;
}
export async function HospitalLogin(data: HospitalLogin) {
  const hospital = await prisma.hospital.findUnique({
    where: {
      userId: data.userId
    }
  })

  if (!hospital) {
    throw new AppError("Invalid userId or password", 401)
  }

  const verify = await bcrypt.compare(data.password, hospital.password)

  if (!verify) {
    throw new AppError("Invalid userId or password", 401)
  }

  const user = {
    id: hospital.id,
    role: "Hospital" 
  }

  const token = jwtTokenSigner(user)
  const {password, ...safeData}= hospital

  return {safeData, token}
}

//hospital search or debouncing 
export async function SearchHospital(name:string){
  const hospital = await prisma.hospital.findMany({
    where:{
      name:{
        contains:name,
        mode: "insensitive"
      }
    },
   select:{
    id: true, 
    name: true,
    helplineNumber: true,
    address: true,
   }
  })
  return hospital
}

//get hospital by id 
export async function GetHospitalById(id:number){
  const hospital = await prisma.hospital.findUnique({
    where:{
      id
    },
    select:{
    id: true, 
    name: true,
    helplineNumber: true,
    address: true,

    }
  })
  return hospital;
}

// get medicines of a patient for a hospital
export async function GetPatientMedicineForHospital(user: { id: number; role: string },patientId: number) {
  if (user?.role !== "Hospital") {
    throw new AppError(COMMON_ERROR.INVALID_ROLE, 403);
  }

  if (!patientId || isNaN(patientId)) {
    throw new AppError("Invalid patient id", 400);
  }

  const result = await prisma.medicineAllotted.findMany({
    where: {
      patientCondition: {
        hospitalId: user.id,
        patientId: patientId,
      },
    },
  });

  return result;
}
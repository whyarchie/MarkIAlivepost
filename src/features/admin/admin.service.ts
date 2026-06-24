import prisma from "../../config/prisma";
import { AppError } from "../../utils/AppError";
import jwtTokenSigner from "../../utils/jwttokensigner";
import type { AdminCreate, AdminLogin } from "./admin.schema";
import bcrypt from "bcrypt";

export async function AdminCreate(data: AdminCreate) {
  const admin = await prisma.admin.create({
    data: {
      name: data.name,
      userId: data.userId,
      password: data.password,
    },
    select: {
      id: true,
      name: true,
      userId: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return admin;
}

export async function AdminLogin(data: AdminLogin) {
  const admin = await prisma.admin.findUnique({
    where: {
      userId: data.userId,
    },
  });

  if (!admin) {
    throw new AppError("Invalid userId or password", 401);
  }

  const verify = await bcrypt.compare(data.password, admin.password);

  if (!verify) {
    throw new AppError("Invalid userId or password", 401);
  }

  const user = {
    id: admin.id,
    role: "Admin",
  };

  const token = jwtTokenSigner(user);
  const { password, ...safeData } = admin;

  return { safeData, token };
}

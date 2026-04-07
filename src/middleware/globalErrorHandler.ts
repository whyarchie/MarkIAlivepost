import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { Prisma } from "../../generated/prisma/client";
import { AppError } from "../utils/AppError";
import { error } from "../constants/messages";

export const globalErrorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  //Service or App Error
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
    return;
  }

  //  Zod validation error
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      errors: err.issues.map((e) => ({
        field: e.path.join("."),
        message: e.message,
      })),
    });
    return;
  }
  //  Prisma unique constraint error (like duplicate mobile number)
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return res.status(409).json({
        success: false,
        message: "Duplicate value for unique field",
      });
    }
    return res.status(400).json({
      success: false,
      message: error.DATABASE_ERROR,
    });
  }

  // Unknown error
  console.error("Unexpected Error:", err);
  return res.status(500).json({
    success: false,
    message: error.INTERNAL_SERVER_ERROR,
  });
};

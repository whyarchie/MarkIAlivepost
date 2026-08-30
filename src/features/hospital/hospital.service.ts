

import crypto from "node:crypto";
import prisma from "../../config/prisma";
import { COMMON_ERROR, PATIENT_ERRORS } from "../../constants/messages";
import { AppError } from "../../utils/AppError";
import jwtTokenSigner from "../../utils/jwttokensigner";
import { getRazorpay } from "../../utils/razorpay";
import { HardDeletePatient } from "../patient/patient.service";
import type { HospitalConditionRecommendation, HospitalCreate, HospitalLogin, HospitalUpdate, HospitalVerifyPayment } from "./hospital.schema";
import bcrypt from "bcrypt"
import { deleteStoredChatObjectsForConditions } from "../chat/chat.service";

// GST charged on top of every wallet top-up. Kept as a fraction of the base
// amount so the paise math below can round once, in the smallest currency unit.
const GST_RATE = 0.18;
export async function HospitalCreate(data: HospitalCreate) {
  const hospital = await prisma.hospital.create({
    data: {
      name: data.name,
      helplineNumber: data.helplineNumber,
      contactNumber: data.contactNumber,
      email: data.email,
      address: data.address,
      userId: data.userId,
      password: data.password,
      // Rupees per enrolled patient per day; omitted → DB default (₹100/day).
      ...(data.perDayPatientCost !== undefined
        ? { perDayPatientCost: data.perDayPatientCost }
        : {}),
    },
    select: {
      id: true,
      name: true,
      helplineNumber: true,
      contactNumber: true,
      email: true,
      address: true,
      userId: true,
      perDayPatientCost: true,
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
  const { password, ...safeData } = hospital

  return { safeData, token }
}

//hospital search or debouncing
export async function SearchHospital(name: string) {
  const hospital = await prisma.hospital.findMany({
    where: {
      name: {
        contains: name,
        mode: "insensitive"
      }
    },
    select: {
      id: true,
      name: true,
      helplineNumber: true,
      address: true,
      perDayPatientCost: true,
    }
  })
  return hospital
}

//get hospital by id
export async function GetHospitalById(id: number) {
  const hospital = await prisma.hospital.findUnique({
    where: {
      id
    },
    select: {
      id: true,
      name: true,
      helplineNumber: true,
      address: true,
      perDayPatientCost: true,
    }
  })
  return hospital;
}

// Everything about a hospital except its password. Used for the hospital's own
// "/me" view and the admin management screens, so it includes the wallet
// balance (paise) and per-day patient cost (rupees).
const HOSPITAL_PROFILE_SELECT = {
  id: true,
  name: true,
  helplineNumber: true,
  contactNumber: true,
  email: true,
  address: true,
  userId: true,
  perDayPatientCost: true,
  balance: true,
  createdAt: true,
  updatedAt: true,
} as const;

// A hospital's own profile (wallet balance + pricing included).
export async function GetHospitalProfile(hospitalId: number) {
  const hospital = await prisma.hospital.findUnique({
    where: { id: hospitalId },
    select: HOSPITAL_PROFILE_SELECT,
  });

  if (!hospital) {
    throw new AppError("Hospital not found", 404);
  }

  return hospital;
}

// Full hospital list for the admin dashboard.
export async function GetAllHospitals() {
  return prisma.hospital.findMany({
    select: HOSPITAL_PROFILE_SELECT,
    orderBy: { name: "asc" },
  });
}

// Admin updates a hospital's info/pricing. Only the fields present in the
// payload are written; the password (when provided) arrives already hashed.
export async function HospitalUpdate(data: HospitalUpdate) {
  const { hospitalId, ...fields } = data;

  const updates = Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  );

  try {
    return await prisma.hospital.update({
      where: { id: hospitalId },
      data: updates,
      select: HOSPITAL_PROFILE_SELECT,
    });
  } catch (error: any) {
    if (error?.code === "P2025") {
      throw new AppError("Hospital not found", 404);
    }
    // Unique constraint (userId / helplineNumber) already taken.
    if (error?.code === "P2002") {
      throw new AppError(
        "Another hospital already uses this userId or helpline number",
        409,
      );
    }
    throw error;
  }
}

// get medicines of a patient for a hospital
export async function GetPatientMedicineForHospital(user: { id: number; role: string }, patientId: number) {
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

// A hospital fills the invoice-facing notes on one of its patient conditions:
// the doctor's recommendation and the invoice instructions printed on the
// patient's downloadable invoice. Only the fields provided are changed, so a
// hospital can update one without clearing the other. A hospital may only edit
// conditions it owns.
export async function UpdateConditionRecommendation(
  hospitalId: number,
  data: HospitalConditionRecommendation,
) {
  const { conditionId, doctorRecommendation, invoiceRecommendation } = data;

  const condition = await prisma.patientCondition.findUnique({
    where: { id: conditionId },
    select: { id: true, hospitalId: true },
  });

  if (!condition) {
    throw new AppError("Condition not found", 404);
  }

  // A hospital may only edit conditions under its own care.
  if (condition.hospitalId !== hospitalId) {
    throw new AppError("This condition does not belong to your hospital", 403);
  }

  const updated = await prisma.patientCondition.update({
    where: { id: conditionId },
    data: {
      ...(doctorRecommendation !== undefined
        ? { DoctorReccommendation: doctorRecommendation }
        : {}),
      ...(invoiceRecommendation !== undefined
        ? { invoiceRecommendation: invoiceRecommendation }
        : {}),
    },
    select: {
      id: true,
      DoctorReccommendation: true,
      invoiceRecommendation: true,
    },
  });

  return updated;
}

// A hospital removes a patient from its care.
// - A patient is "enrolled with" a hospital through their PatientCondition rows.
// - If the patient is enrolled with more than one hospital, we must NOT wipe the
//   whole patient — we only delete THIS hospital's conditions for them.
// - If this hospital is their only enrollment, the whole patient is deleted.
export async function HospitalDeletePatient(hospitalId: number, patientId: number) {
  // Every condition for this patient, with the hospital that owns it.
  const conditions = await prisma.patientCondition.findMany({
    where: { patientId },
    select: { id: true, hospitalId: true },
  });

  if (conditions.length === 0) {
    throw new AppError(PATIENT_ERRORS.INVALID_PATIENT, 404);
  }

  // A hospital may only delete a patient it actually treats.
  const ownsPatient = conditions.some((c) => c.hospitalId === hospitalId);
  if (!ownsPatient) {
    throw new AppError("This patient is not enrolled with your hospital", 403);
  }

  const distinctHospitals = new Set(conditions.map((c) => c.hospitalId)).size;

  // Enrolled with other hospitals too → only remove this hospital's enrollment.
  if (distinctHospitals > 1) {
    await deleteStoredChatObjectsForConditions(
      conditions.filter((condition) => condition.hospitalId === hospitalId).map((condition) => condition.id),
    );
    const { count } = await prisma.patientCondition.deleteMany({
      where: { patientId, hospitalId },
    });

    return {
      deleted: "conditions" as const,
      patientId,
      conditionsDeleted: count,
    };
  }

  // This hospital is the patient's only enrollment → delete the whole patient.
  const patient = await HardDeletePatient(patientId);

  return { deleted: "patient" as const, patient };
}

export async function HospitalAddBalance(hospitalId: number, amount: number) {
  if (amount <= 0) {
    throw new AppError("Amount must be greater than zero", 400);
  }
  const hospital = await prisma.hospital.findUnique({
    where: { id: hospitalId },
  });

  if (!hospital) {
    throw new AppError("Hospital not found", 404);
  }

  // Razorpay works in the smallest currency unit (paise); the Order.amount
  // column is also stored in paise. Round to paise first, then derive GST
  // from that integer so `baseAmount + gstAmount` always equals the amount
  // actually charged (no drift from rounding rupees and paise separately).
  const baseAmountInPaise = Math.round(amount * 100);
  const gstAmountInPaise = Math.round(baseAmountInPaise * GST_RATE);
  const totalAmountInPaise = baseAmountInPaise + gstAmountInPaise;

  const options = {
    amount: totalAmountInPaise,
    currency: "INR",
    receipt: `order_rcptid_${hospitalId}_${Date.now()}`,
    notes: {
      hospitalId: hospitalId.toString(),
    },
  };

  const order = await getRazorpay().orders.create(options);

  await prisma.order.create({
    data: {
      razorpayOrderId: order.id,
      hospitalId: hospitalId,
      amount: totalAmountInPaise,
      baseAmount: baseAmountInPaise,
      currency: options.currency,
      receipt: options.receipt,
      status: order.status ?? "created",
    },
  });

  // Prefill for the Razorpay Checkout modal, sourced from the DB so the payer
  // is never asked for contact/email. Both columns are required, so they are
  // always present. Razorpay's contact field wants digits only, so strip any
  // separators (older seed data may contain dashes).
  return {
    order,
    gst: {
      baseAmount: baseAmountInPaise,
      gstAmount: gstAmountInPaise,
      gstRate: GST_RATE,
      totalAmount: totalAmountInPaise,
    },
    prefill: {
      name: hospital.name,
      email: hospital.email,
      contact: hospital.contactNumber.replace(/\D/g, ""),
    },
  };
}

// Verifies a completed Razorpay checkout and, on success, marks the order paid
// and credits the hospital's balance. Amounts are handled in paise throughout
// (Order.amount and Hospital.balance are both stored in paise).
export async function HospitalVerifyPayment(
  hospitalId: number,
  data: HospitalVerifyPayment,
) {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = data;

  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) {
    throw new AppError("Payment gateway is not configured", 500);
  }

  // Razorpay checkout signature = HMAC_SHA256(order_id + "|" + payment_id, key_secret).
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  const signatureIsValid =
    expectedSignature.length === razorpay_signature.length &&
    crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(razorpay_signature),
    );

  if (!signatureIsValid) {
    throw new AppError("Invalid payment signature", 400);
  }

  const order = await prisma.order.findUnique({
    where: { razorpayOrderId: razorpay_order_id },
  });

  if (!order) {
    throw new AppError("Order not found", 404);
  }

  // A hospital may only verify payments against its own orders.
  if (order.hospitalId !== hospitalId) {
    throw new AppError("This order does not belong to your hospital", 403);
  }

  return settlePayment({
    order,
    razorpayPaymentId: razorpay_payment_id,
    razorpaySignature: razorpay_signature,
    status: "captured",
  });
}

// Idempotently records a successful payment, marks its order paid and credits
// the hospital's balance in a single transaction. Shared by the client-side
// /verify flow and the Razorpay /webhook. Amounts are in paise. The wallet is
// credited `order.baseAmount`, not `order.amount` — the difference is GST,
// which was collected but isn't spendable balance.
async function settlePayment(params: {
  order: { razorpayOrderId: string; hospitalId: number; amount: number; baseAmount: number };
  razorpayPaymentId: string;
  razorpaySignature: string | null;
  status: string;
}) {
  const { order, razorpayPaymentId, razorpaySignature, status } = params;

  // If we've already recorded this payment, don't credit twice.
  const existingPayment = await prisma.payment.findUnique({
    where: { razorpayPaymentId },
  });

  if (existingPayment) {
    return {
      alreadyProcessed: true,
      orderId: order.razorpayOrderId,
      paymentId: existingPayment.razorpayPaymentId,
    };
  }

  // Payment.razorpayPaymentId is unique, so concurrent duplicates fail on insert
  // rather than double-crediting the balance.
  const [payment, , updatedHospital] = await prisma.$transaction([
    prisma.payment.create({
      data: {
        razorpayPaymentId,
        razorpayOrderId: order.razorpayOrderId,
        razorpaySignature,
        amount: order.amount,
        status,
      },
    }),
    prisma.order.update({
      where: { razorpayOrderId: order.razorpayOrderId },
      data: { status: "paid" },
    }),
    prisma.hospital.update({
      where: { id: order.hospitalId },
      data: { balance: { increment: order.baseAmount } },
    }),
  ]);

  return {
    alreadyProcessed: false,
    orderId: order.razorpayOrderId,
    paymentId: payment.razorpayPaymentId,
    balance: updatedHospital.balance,
  };
}

// Handles Razorpay server-to-server webhooks. Verifies the signature over the
// raw body using the webhook secret, then credits the hospital on a captured
// payment. Returns a summary; the caller should always respond 200 on a valid
// signature so Razorpay stops retrying.
export async function HospitalPaymentWebhook(rawBody: Buffer, signature: string) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    throw new AppError("Payment webhook is not configured", 500);
  }

  // Razorpay signs the raw request body with the webhook secret.
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  const signatureIsValid =
    !!signature &&
    expectedSignature.length === signature.length &&
    crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(signature),
    );

  if (!signatureIsValid) {
    throw new AppError("Invalid webhook signature", 400);
  }

  const event = JSON.parse(rawBody.toString());

  // We only act on captured payments; acknowledge anything else so Razorpay
  // stops retrying.
  if (event?.event !== "payment.captured") {
    return { handled: false, event: event?.event ?? "unknown" };
  }

  const entity = event?.payload?.payment?.entity;
  const razorpayPaymentId: string | undefined = entity?.id;
  const razorpayOrderId: string | undefined = entity?.order_id;

  if (!razorpayPaymentId || !razorpayOrderId) {
    throw new AppError("Malformed webhook payload", 400);
  }

  const order = await prisma.order.findUnique({
    where: { razorpayOrderId },
  });

  // Unknown order (e.g. created outside this system). Acknowledge to stop retries.
  if (!order) {
    return { handled: false, reason: "order not found", orderId: razorpayOrderId };
  }

  const result = await settlePayment({
    order,
    razorpayPaymentId,
    razorpaySignature: null,
    status: entity?.status ?? "captured",
  });

  return { handled: true, ...result };
}


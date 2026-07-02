import Razorpay from "razorpay";
import { AppError } from "./AppError";

let client: Razorpay | null = null;

// Lazily create the Razorpay client so a missing key doesn't crash the whole
// app at boot — only the payment endpoints fail, and with a clear 500.
export function getRazorpay(): Razorpay {
  if (client) return client;

  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;

  if (!key_id || !key_secret) {
    throw new AppError(
      "Payment gateway is not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET missing)",
      500,
    );
  }

  client = new Razorpay({ key_id, key_secret });
  return client;
}

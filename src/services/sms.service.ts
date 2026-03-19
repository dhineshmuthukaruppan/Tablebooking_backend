import twilio, { type Twilio } from "twilio";
import { env } from "../config/env";
import { logger } from "../config/logger";

interface SendSmsParams {
  to: string;
  body: string;
}

let twilioClient: Twilio | null = null;

function maskPhoneNumber(phoneNumber: string): string {
  if (phoneNumber.length <= 4) return phoneNumber;
  return `${phoneNumber.slice(0, 4)}${"*".repeat(Math.max(phoneNumber.length - 8, 0))}${phoneNumber.slice(-4)}`;
}

function getTwilioClient(): Twilio | null {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_PHONE_NUMBER) {
    logger.warn("Twilio SMS skipped: configuration incomplete", {
      hasAccountSid: Boolean(env.TWILIO_ACCOUNT_SID),
      hasAuthToken: Boolean(env.TWILIO_AUTH_TOKEN),
      hasFromNumber: Boolean(env.TWILIO_PHONE_NUMBER),
    });
    return null;
  }

  if (!twilioClient) {
    twilioClient = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  }

  return twilioClient;
}

export async function sendSMS({ to, body }: SendSmsParams): Promise<void> {
  try {
    const client = getTwilioClient();
    if (!client) return;

    const message = await client.messages.create({
      from: env.TWILIO_PHONE_NUMBER,
      to,
      body,
    });

    logger.info("Twilio SMS sent", {
      to: maskPhoneNumber(to),
      messageSid: message.sid,
      status: message.status,
    });
  } catch (error) {
    logger.error("Twilio SMS failed", {
      to: maskPhoneNumber(to),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

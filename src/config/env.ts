import dotenv from "dotenv";
import { z } from "zod";

// Load .env first, then .env.local (overrides) so local dev can use .env.local
dotenv.config();
dotenv.config({ path: ".env.local", override: true });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "staging", "production"]).default("development"),
  PORT: z.coerce.number().default(5001),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  FIREBASE_PROJECT_ID: z.string().min(1, "FIREBASE_PROJECT_ID is required"),
  FIREBASE_CLIENT_EMAIL: z.string().min(1, "FIREBASE_CLIENT_EMAIL is required"),
  FIREBASE_PRIVATE_KEY: z.string().min(1, "FIREBASE_PRIVATE_KEY is required"),
  GCS_BUCKET: z.string().min(1, "GCS_BUCKET is required"),
  CORS_ORIGIN: z
    .string()
    .default(
      "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001"
    ),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(8000),
  RATE_LIMIT_TABLE_ALLOCATIONS_GET_MAX_REQUESTS: z.coerce.number().default(3000),
  RATE_LIMIT_AUTH_MAX_REQUESTS: z.coerce.number().default(50),
  FRONTEND_URL: z.string().optional().default(""),
  MAIL_FROM: z.string().optional().default(""),
  TWILIO_ACCOUNT_SID: z.string().default(""),
  TWILIO_AUTH_TOKEN: z.string().default(""),
  TWILIO_PHONE_NUMBER: z.string().default(""),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const data = parsed.data;
export const env = {
  ...data,
  FIREBASE_PRIVATE_KEY: data.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  FRONTEND_URL: data.FRONTEND_URL && data.FRONTEND_URL.trim() ? data.FRONTEND_URL : undefined,
  MAIL_FROM: data.MAIL_FROM && data.MAIL_FROM.trim() ? data.MAIL_FROM : undefined,
};

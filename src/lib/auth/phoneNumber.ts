import { parsePhoneNumberFromString } from "libphonenumber-js";

export function normalizePhoneNumber(phoneNumber?: string | null): string | null {
  if (!phoneNumber || typeof phoneNumber !== "string") {
    return null;
  }

  const parsed = parsePhoneNumberFromString(phoneNumber);
  if (!parsed || !parsed.isValid()) {
    return null;
  }

  return parsed.number;
}

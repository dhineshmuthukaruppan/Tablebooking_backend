import type { Request, Response } from "express";
import db from "../../databaseUtilities";
import { normalizePhoneNumber } from "../../lib/auth/phoneNumber";
import type { UserDocument } from "../../lib/db/types";

export async function checkPhoneHandler(req: Request, res: Response): Promise<void> {
  try {
    const rawPhone = typeof req.query.phone === "string" ? req.query.phone : "";
    const normalizedPhone = normalizePhoneNumber(rawPhone);

    if (!normalizedPhone) {
      res.status(400).json({ message: "Invalid phone number" });
      return;
    }

    const existingUser = (await db.read.findOne({
      req,
      connectionString: db.constants.connectionStrings.tableBooking,
      collection: "users",
      query: { phoneNumber: normalizedPhone },
    })) as UserDocument | null;

    const exists = Boolean(existingUser);
    console.log("CHECK PHONE -> exists:", exists);
    res.status(200).json({ exists });
  } catch {
    res.status(500).json({ message: "Unable to check phone number" });
  }
}

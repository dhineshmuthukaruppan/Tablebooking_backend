import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import db from "../../databaseUtilities";
import { firebaseAdminAuth } from "../../config/firebase-admin";

const TABLE_BOOKING_CONN = db.constants.connectionStrings.tableBooking;

function normalizePhone(phone: string): string {
  const parsed = parsePhoneNumberFromString(phone);
  return parsed ? parsed.number : phone;
}

interface PhoneLoginBody {
  phoneNumber?: string;
  password?: string;
}

interface PhonePasswordBody {
  phoneNumber?: string;
  newPassword?: string;
}

export async function setPhonePasswordHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    if (!req.user || !req.user.phoneNumber) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const { newPassword } = (req.body as PhonePasswordBody) ?? {};
    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 6) {
      res.status(400).json({ message: "Password must be at least 6 characters" });
      return;
    }

    const hash = await bcrypt.hash(newPassword, 10);
    const normalizedPhone = normalizePhone(req.user.phoneNumber);

    await db.update.updateOne({
      req,
      connectionString: TABLE_BOOKING_CONN,
      collection: "phone_credentials",
      query: { phoneNumber: normalizedPhone },
      update: {
        $set: {
          phoneNumber: normalizedPhone,
          passwordHash: hash,
          updatedAt: new Date(),
        },
      },
    });

    res.status(200).json({ message: "Phone password set successfully" });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function phoneLoginHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { phoneNumber, password } = (req.body as PhoneLoginBody) ?? {};
    // #region agent log
    fetch('http://127.0.0.1:7523/ingest/6df3f0fb-ba94-436b-ba90-c5b1ad0e266b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'43319a'},body:JSON.stringify({sessionId:'43319a',runId:'pre-fix',hypothesisId:'H1',location:'phoneAuth.handler.ts:68',message:'phone login request body',data:{body:req.body},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (!phoneNumber || !password) {
      res.status(400).json({ message: "phoneNumber and password are required" });
      return;
    }

    const normalizedPhone = normalizePhone(phoneNumber);
    // #region agent log
    fetch('http://127.0.0.1:7523/ingest/6df3f0fb-ba94-436b-ba90-c5b1ad0e266b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'43319a'},body:JSON.stringify({sessionId:'43319a',runId:'pre-fix',hypothesisId:'H1',location:'phoneAuth.handler.ts:74',message:'normalized phone',data:{inputPhone:phoneNumber,normalizedPhone},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    const connectionString = TABLE_BOOKING_CONN;

    const user = await db.read.findOne({
      req,
      connectionString,
      collection: "users",
      query: { phoneNumber: normalizedPhone },
    }) as { firebaseUid?: string } | null;

    // #region agent log
    fetch('http://127.0.0.1:7523/ingest/6df3f0fb-ba94-436b-ba90-c5b1ad0e266b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'43319a'},body:JSON.stringify({sessionId:'43319a',runId:'pre-fix',hypothesisId:'H2',location:'phoneAuth.handler.ts:78',message:'user lookup result for phone login',data:{normalizedPhone,userHasFirebaseUid:Boolean(user?.firebaseUid)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    if (!user?.firebaseUid) {
      // #region agent log
      fetch('http://127.0.0.1:7523/ingest/6df3f0fb-ba94-436b-ba90-c5b1ad0e266b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'43319a'},body:JSON.stringify({sessionId:'43319a',runId:'pre-fix',hypothesisId:'H2',location:'phoneAuth.handler.ts:85',message:'login failed - user not found or missing firebaseUid',data:{normalizedPhone},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      res.status(401).json({ message: "Invalid phone or password" });
      return;
    }

    const creds = await db.read.findOne({
      req,
      connectionString,
      collection: "phone_credentials",
      query: { phoneNumber: normalizedPhone },
    }) as { passwordHash?: string } | null;
    // #region agent log
    fetch('http://127.0.0.1:7523/ingest/6df3f0fb-ba94-436b-ba90-c5b1ad0e266b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'43319a'},body:JSON.stringify({sessionId:'43319a',runId:'pre-fix',hypothesisId:'H3',location:'phoneAuth.handler.ts:90',message:'phone credentials lookup result',data:{normalizedPhone,hasCreds:Boolean(creds),hasPasswordHash:Boolean(creds?.passwordHash)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    if (!creds?.passwordHash) {
      // First-time password setup on login: create phone_credentials with provided password
      const hash = await bcrypt.hash(password, 10);
      await db.update.updateOne({
        req,
        connectionString,
        collection: "phone_credentials",
        query: { phoneNumber: normalizedPhone },
        update: {
          $set: {
            phoneNumber: normalizedPhone,
            passwordHash: hash,
            updatedAt: new Date(),
          },
        },
      });
      // #region agent log
      fetch('http://127.0.0.1:7523/ingest/6df3f0fb-ba94-436b-ba90-c5b1ad0e266b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'43319a'},body:JSON.stringify({sessionId:'43319a',runId:'pre-fix',hypothesisId:'H6',location:'phoneAuth.handler.ts:104',message:'auto-created phone credentials on login',data:{normalizedPhone},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
    } else {
      const ok = await bcrypt.compare(password, creds.passwordHash);
      // #region agent log
      fetch('http://127.0.0.1:7523/ingest/6df3f0fb-ba94-436b-ba90-c5b1ad0e266b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'43319a'},body:JSON.stringify({sessionId:'43319a',runId:'pre-fix',hypothesisId:'H4',location:'phoneAuth.handler.ts:112',message:'password comparison result',data:{normalizedPhone,ok},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      if (!ok) {
        // #region agent log
        fetch('http://127.0.0.1:7523/ingest/6df3f0fb-ba94-436b-ba90-c5b1ad0e266b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'43319a'},body:JSON.stringify({sessionId:'43319a',runId:'pre-fix',hypothesisId:'H4',location:'phoneAuth.handler.ts:116',message:'login failed - password mismatch',data:{normalizedPhone},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        res.status(401).json({ message: "Invalid phone or password" });
        return;
      }
    }

    const customToken = await firebaseAdminAuth.createCustomToken(user.firebaseUid);

    // #region agent log
    fetch('http://127.0.0.1:7523/ingest/6df3f0fb-ba94-436b-ba90-c5b1ad0e266b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'43319a'},body:JSON.stringify({sessionId:'43319a',runId:'pre-fix',hypothesisId:'H5',location:'phoneAuth.handler.ts:123',message:'phone login succeeded',data:{normalizedPhone,hasCustomToken:Boolean(customToken)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    res.status(200).json({
      message: "Phone login successful",
      data: { customToken },
    });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function resetPasswordPhoneHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    if (!req.user || !req.user.phoneNumber) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const { phoneNumber, newPassword } = (req.body as PhonePasswordBody) ?? {};

    if (!phoneNumber || phoneNumber !== req.user.phoneNumber) {
      res.status(400).json({ message: "phoneNumber must match authenticated user" });
      return;
    }

    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 6) {
      res.status(400).json({ message: "Password must be at least 6 characters" });
      return;
    }

    const hash = await bcrypt.hash(newPassword, 10);

    await db.update.updateOne({
      req,
      connectionString: TABLE_BOOKING_CONN,
      collection: "phone_credentials",
      query: { phoneNumber },
      update: {
        $set: {
          phoneNumber,
          passwordHash: hash,
          updatedAt: new Date(),
        },
      },
    });

    res.status(200).json({ message: "Password reset successfully" });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}


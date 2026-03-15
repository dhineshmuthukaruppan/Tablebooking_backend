import type { Request, Response } from "express";
import { ObjectId } from "mongodb";
import db from "../../databaseUtilities";
import { ROLES, type Role } from "../../constants/roles";
import type { UserStatus, UserDocument } from "../../lib/db/types";
import { firebaseAdminAuth } from "../../config/firebase-admin";
import { verifyIdToken } from "../../lib/auth/verifyFirebaseToken";

export interface ListUsersBody {
  page?: number;
  limit?: number;
  role?: string[];
  status?: string[];
  isEmailVerified?: string;
}

async function listUsers(
  req: Request,
  page: number,
  limit: number,
  roles: string[],
  statuses: string[],
  isEmailVerified: string | undefined
): Promise<{ items: unknown[]; total: number }> {
  const validRoles = roles.filter((r) => ROLES.includes(r as Role));
  const validStatuses = statuses.filter((s) => s === "active" || s === "inactive");
  const connectionString = db.constants.connectionStrings.tableBooking;
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = {};
  if (validRoles.length > 0) filter.role = { $in: validRoles };
  if (validStatuses.length > 0) filter.status = { $in: validStatuses };
  if (isEmailVerified === "true") filter.isEmailVerified = true;
  if (isEmailVerified === "false") filter.isEmailVerified = false;

  const [items, total] = await Promise.all([
    db.read.find({
      req,
      connectionString,
      collection: "users",
      query: filter,
      projection: { firebaseUid: 0 },
      sort: { createdAt: -1 },
      skip,
      limit,
    }),
    db.read.count({
      req,
      connectionString,
      collection: "users",
      query: filter,
    }),
  ]);

  return { items, total };
}

export async function getUsersHandler(req: Request, res: Response): Promise<void> {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const roleParam = req.query.role;
    const statusParam = req.query.status;
    const roles = (Array.isArray(roleParam) ? roleParam : roleParam ? [roleParam] : []) as string[];
    const statuses = (Array.isArray(statusParam) ? statusParam : statusParam ? [statusParam] : []) as string[];
    const isEmailVerified = (Array.isArray(req.query.isEmailVerified) ? req.query.isEmailVerified[0] : req.query.isEmailVerified) as string | undefined;

    const { items, total } = await listUsers(req, page, limit, roles, statuses, isEmailVerified);

    res.status(200).json({
      message: "User list",
      data: { items, total, page, limit },
    });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

/** POST /usermanagement/users/list – list users with filters in body (page, limit, role[], status[], isEmailVerified). */
export async function listUsersPostHandler(req: Request, res: Response): Promise<void> {
  try {
    const body = (req.body as ListUsersBody) ?? {};
    const page = Math.max(1, Number(body.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(body.limit) || 20));
    const roles = Array.isArray(body.role) ? body.role : [];
    const statuses = Array.isArray(body.status) ? body.status : [];
    const isEmailVerified = typeof body.isEmailVerified === "string" ? body.isEmailVerified : undefined;

    const { items, total } = await listUsers(req, page, limit, roles, statuses, isEmailVerified);

    res.status(200).json({
      message: "User list",
      data: { items, total, page, limit },
    });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

export interface AddUserBody {
  idToken?: string;
  username?: string;
  phoneNumber?: string;
  role?: string;
  status?: string;
}

export async function addUserHandler(req: Request, res: Response): Promise<void> {
  try {
    const body = (req.body as AddUserBody) ?? {};
    const { idToken, username, phoneNumber, role: rawRole, status: rawStatus } = body;

    const decoded = await verifyIdToken(idToken);
    if (!decoded) {
      res.status(401).json({ message: "Invalid or missing idToken" });
      return;
    }

    const email = (decoded.email ?? "").toLowerCase().trim();
    if (!email) {
      res.status(400).json({ message: "Email is required" });
      return;
    }

    const connectionString = db.constants.connectionStrings.tableBooking;
    const isEmailVerified = Boolean(decoded.email_verified);
    const displayNameTrimmed =
      typeof username === "string" ? username.trim() : undefined;
    const phoneNumberTrimmed =
      typeof phoneNumber === "string" ? phoneNumber.trim() : undefined;

    let user = await db.read.findOne({
      req,
      connectionString,
      collection: "users",
      query: { firebaseUid: decoded.uid },
    }) as UserDocument | null;

    const now = new Date();

    const role = (rawRole ?? user?.role ?? "user") as Role;
    if (!ROLES.includes(role)) {
      res.status(400).json({ message: "Invalid role. Must be one of: user, staff, admin" });
      return;
    }
    const status = (rawStatus === "inactive" ? "inactive" : "active") as UserStatus;

    if (!user) {
      const newUser: UserDocument = {
        firebaseUid: decoded.uid,
        email,
        ...(displayNameTrimmed && { displayName: displayNameTrimmed }),
        ...(phoneNumberTrimmed && { phoneNumber: phoneNumberTrimmed }),
        role,
        status,
        isEmailVerified,
        isPhoneVerified: false,
        isEligibleForCoupons: false,
        createdAt: now,
        updatedAt: now,
      };
      await db.create.insertOne({
        req,
        connectionString,
        collection: "users",
        payload: newUser as unknown as Record<string, unknown>,
      });
      user = await db.read.findOne({
        req,
        connectionString,
        collection: "users",
        query: { firebaseUid: decoded.uid },
      }) as UserDocument | null;
    } else {
      const updateFields: Record<string, unknown> = {
        isEmailVerified,
        role,
        status,
        updatedAt: now,
      };
      if (displayNameTrimmed !== undefined) updateFields.displayName = displayNameTrimmed;
      if (phoneNumberTrimmed !== undefined) updateFields.phoneNumber = phoneNumberTrimmed;
      await db.update.updateOne({
        req,
        connectionString,
        collection: "users",
        query: { firebaseUid: decoded.uid },
        update: { $set: updateFields },
      });
      user = await db.read.findOne({
        req,
        connectionString,
        collection: "users",
        query: { firebaseUid: decoded.uid },
      }) as UserDocument | null;
    }

    if (!user) {
      res.status(500).json({ message: "Failed to create user" });
      return;
    }

    res.status(201).json({
      message: "User added successfully",
      data: {
        email: user.email,
        username: user.displayName,
        phoneNumber: user.phoneNumber,
        role: user.role,
        status: user.status,
      },
    });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

export interface UpdateUserBody {
  username?: string;
  role?: string;
  status?: string;
  email?: string;
  phoneNumber?: string;
}

/** PATCH /usermanagement/users/:id – update displayName, role, status (email/mobile not allowed). Updates Firebase displayName if user has real Firebase uid. */
export async function updateUserHandler(req: Request, res: Response): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id || typeof id !== "string" || !ObjectId.isValid(id)) {
      res.status(400).json({ message: "Invalid user ID" });
      return;
    }
    const body = (req.body as UpdateUserBody) ?? {};
    const connectionString = db.constants.connectionStrings.tableBooking;

    const existing = await db.read.findOne({
      req,
      connectionString,
      collection: "users",
      query: { _id: new ObjectId(id) },
    }) as { firebaseUid?: string; displayName?: string; email?: string; phoneNumber?: string } | null;

    if (!existing) {
      res.status(404).json({ message: "User not found" });
      return;
    }
    console.log("existing", existing);

    const update: Record<string, unknown> = { updatedAt: new Date() };
    const username = typeof body.username === "string" ? body.username.trim() : undefined;
    if (username !== undefined) update.displayName = username || null;
    const role = body.role as Role | undefined;
    if (role !== undefined && ROLES.includes(role)) update.role = role;
    const status = body.status === "inactive" ? "inactive" : body.status === "active" ? "active" : undefined;
    if (status !== undefined) update.status = status;
    if (body.email !== undefined && !(typeof existing.email === "string" && existing.email.trim() !== "")) {
      update.email = body.email;
    }
    if (body.phoneNumber !== undefined && !(typeof existing.phoneNumber === "string" && existing.phoneNumber.trim() !== "")) {
      update.phoneNumber = body.phoneNumber;
    }
    if (Object.keys(update).length <= 1) {
      res.status(400).json({ message: "No valid fields to update (username, role, status)" });
      return;
    }

    if (username !== undefined && existing.firebaseUid && !existing.firebaseUid.startsWith("admin-created-")) {
      try {
        await firebaseAdminAuth.updateUser(existing.firebaseUid, { displayName: username || undefined });
      } catch {
        // Continue to update MongoDB even if Firebase update fails (e.g. user not in Firebase)
      }
    }

    await db.update.updateOne({
      req,
      connectionString,
      collection: "users",
      query: { _id: new ObjectId(id) },
      update: { $set: update },
    });

    res.status(200).json({ message: "User updated", data: { ...update } });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

/** PATCH /usermanagement/users/:id/status – soft delete: set status to inactive. */
export async function setUserStatusHandler(req: Request, res: Response): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id || typeof id !== "string" || !ObjectId.isValid(id)) {
      res.status(400).json({ message: "Invalid user ID" });
      return;
    }
    const body = req.body as { status?: string };
    const status = body.status === "active" ? "active" : "inactive";

    const connectionString = db.constants.connectionStrings.tableBooking;
    const result = await db.update.updateOne({
      req,
      connectionString,
      collection: "users",
      query: { _id: new ObjectId(id) },
      update: { $set: { status, updatedAt: new Date() } },
    });

    if (result.matchedCount === 0) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    res.status(200).json({ message: status === "inactive" ? "User deactivated" : "User activated", data: { status } });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

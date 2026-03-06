import type { Request, Response } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../../config/database";
import { getUsersCollection } from "../../lib/db/collections";
import { ROLES, type Role } from "../../constants/roles";

export async function getUsersHandler(req: Request, res: Response): Promise<void> {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const role = (Array.isArray(req.query.role) ? req.query.role[0] : req.query.role) as Role | undefined;
    const isEmailVerified = Array.isArray(req.query.isEmailVerified) ? req.query.isEmailVerified[0] : req.query.isEmailVerified;
    const isEligibleForCoupons = Array.isArray(req.query.isEligibleForCoupons) ? req.query.isEligibleForCoupons[0] : req.query.isEligibleForCoupons;

    const db = getDb();
    const usersColl = getUsersCollection(db);

    const filter: Record<string, unknown> = {};
    if (role && ROLES.includes(role)) filter.role = role;
    if (isEmailVerified === "true") filter.isEmailVerified = true;
    if (isEmailVerified === "false") filter.isEmailVerified = false;
    if (isEligibleForCoupons === "true") filter.isEligibleForCoupons = true;
    if (isEligibleForCoupons === "false") filter.isEligibleForCoupons = false;

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      usersColl
        .find(filter, { projection: { firebaseUid: 0 } })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      usersColl.countDocuments(filter),
    ]);

    res.status(200).json({
      message: "User list",
      data: { items, total, page, limit },
    });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function patchUserHandler(req: Request, res: Response): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id || typeof id !== "string" || !ObjectId.isValid(id)) {
      res.status(400).json({ message: "Invalid user ID" });
      return;
    }
    const body = req.body as { role?: Role; isEligibleForCoupons?: boolean };
    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (body.role !== undefined && ROLES.includes(body.role)) update.role = body.role;
    if (typeof body.isEligibleForCoupons === "boolean") update.isEligibleForCoupons = body.isEligibleForCoupons;

    if (Object.keys(update).length <= 1) {
      res.status(400).json({ message: "No valid fields to update (role, isEligibleForCoupons)" });
      return;
    }

    const db = getDb();
    const usersColl = getUsersCollection(db);
    const result = await usersColl.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: update },
      { returnDocument: "after", projection: { firebaseUid: 0 } }
    );

    if (!result) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    res.status(200).json({ message: "User updated", data: result });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

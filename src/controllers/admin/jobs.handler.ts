import type { Request, Response } from "express";
import { getDb } from "../../config/database";
import { runSlotInventoryCleanup } from "../../lib/db/collections";

/**
 * POST /admin/jobs/cleanup-slot-inventory — delete slot_inventory where bookingDate < today.
 * For use by cron or scheduler. Admin only.
 */
export async function cleanupSlotInventoryHandler(_req: Request, res: Response): Promise<void> {
  try {
    const db = getDb();
    const { deletedCount } = await runSlotInventoryCleanup(db);
    res.status(200).json({
      message: "Slot inventory cleanup completed",
      data: { deletedCount },
    });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

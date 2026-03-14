import type { Request, Response } from "express";
import { ObjectId } from "mongodb";
import db from "../../databaseUtilities";
import { logger } from "../../config/logger";
import * as slotInventory from "../../services/slotInventory";
import type { TableMasterSection } from "./master/table-master.handler";

function isOfflineBookingId(bookingId: string): boolean {
  return bookingId === "__offline__" || bookingId.startsWith("offline_");
}

const TABLE_MASTER_CONFIG_ID = "config";

/** Security: allowed tableKey format (e.g. s0-t0). */
const TABLE_KEY_REGEX = /^s\d+-t\d+$/;
const MAX_BOOKING_ID_LENGTH = 128;
const MAX_GUEST_NAME_LENGTH = 200;
const MAX_ALLOCATIONS_PER_REQUEST = 50;
const MAX_GUESTS_AT_TABLE = 999;

export interface AllocationDoc {
  _id?: unknown;
  allocationDate: string;
  tableKey: string;
  sectionIndex: number;
  tableIndex: number;
  bookingId: string;
  guestName?: string;
  guestCount?: number;
  guestsAtThisTable: number;
  status: string;
  allocatedBy: string;
  allocatedByName?: string;
  /** For offline/walk-in: slot and section for slot_inventory when recording payment. */
  slotStartTime?: string;
  slotEndTime?: string;
  sectionId?: string;
  sectionName?: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Build map tableKey -> seat capacity from table_master sections. */
function buildTableCapacityMap(sections: TableMasterSection[]): Map<string, number> {
  const map = new Map<string, number>();
  for (let si = 0; si < sections.length; si++) {
    const sec = sections[si];
    const tables = sec?.tables ?? [];
    for (let ti = 0; ti < tables.length; ti++) {
      const t = tables[ti] as { id?: string; seats?: number | null };
      const seats = t?.seats != null && Number.isFinite(Number(t.seats)) ? Number(t.seats) : 0;
      map.set(`s${si}-t${ti}`, seats);
    }
  }
  return map;
}

/** GET /admin/table-allocations?date=YYYY-MM-DD */
export async function getTableAllocationsHandler(req: Request, res: Response): Promise<void> {
  try {
    const dateParam = typeof req.query.date === "string" ? req.query.date : undefined;
    const allocationDate =
      dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : new Date().toISOString().slice(0, 10);

    const connectionString = db.constants.connectionStrings.tableBooking;
    const list = (await db.read.find({
      req,
      connectionString,
      collection: "table_allocations",
      query: { allocationDate },
      sort: { tableKey: 1, createdAt: 1 },
    })) as AllocationDoc[];

    res.status(200).json({ data: list });
  } catch (err) {
    logger.error("allocations.get.failed", { handler: "getTableAllocations", error: err instanceof Error ? err.message : "unknown" });
    res.status(500).json({ message: "Internal server error" });
  }
}

/** POST /admin/table-allocations — insert only; first-write-wins; 409 if already allocated. */
export async function postTableAllocationsHandler(req: Request, res: Response): Promise<void> {
  try {
    const staff = req.user;
    if (!staff?.id) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    const allocatedBy = staff.id instanceof ObjectId ? staff.id.toString() : String(staff.id);
    const allocatedByName =
      typeof (staff as { displayName?: string }).displayName === "string"
        ? (staff as { displayName: string }).displayName
        : (staff as { email?: string }).email ?? allocatedBy;

    const body = req.body as { allocationDate?: string; allocations?: unknown[] };
    const allocationDate =
      typeof body.allocationDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.allocationDate)
        ? body.allocationDate
        : new Date().toISOString().slice(0, 10);

    const raw = Array.isArray(body.allocations) ? body.allocations : [];
    if (raw.length > MAX_ALLOCATIONS_PER_REQUEST) {
      res.status(400).json({ message: `Too many allocations (max ${MAX_ALLOCATIONS_PER_REQUEST})` });
      return;
    }
    const allocations: Array<{
      allocationDate: string;
      tableKey: string;
      sectionIndex: number;
      tableIndex: number;
      bookingId: string;
      guestName?: string;
      guestCount?: number;
      guestsAtThisTable: number;
      status: string;
      slotStartTime?: string;
      slotEndTime?: string;
      sectionId?: string;
      sectionName?: string;
    }> = [];
    for (const a of raw) {
      if (a == null || typeof a !== "object") continue;
      const o = a as Record<string, unknown>;
      const tableKeyRaw = typeof o.tableKey === "string" ? o.tableKey.trim() : "";
      const bookingIdRaw = typeof o.bookingId === "string" ? o.bookingId.trim() : "";
      if (!tableKeyRaw || !bookingIdRaw) continue;
      if (!TABLE_KEY_REGEX.test(tableKeyRaw)) continue;
      if (bookingIdRaw.length > MAX_BOOKING_ID_LENGTH) continue;
      const guestsAtThisTable =
        typeof o.guestsAtThisTable === "number" && o.guestsAtThisTable >= 0 && o.guestsAtThisTable <= MAX_GUESTS_AT_TABLE
          ? o.guestsAtThisTable
          : 0;
      let guestName: string | undefined;
      if (typeof o.guestName === "string") {
        const trimmed = o.guestName.trim();
        guestName = trimmed.length <= MAX_GUEST_NAME_LENGTH ? trimmed : trimmed.slice(0, MAX_GUEST_NAME_LENGTH);
      }
      const slotStartTime = typeof o.slotStartTime === "string" && o.slotStartTime.trim() ? o.slotStartTime.trim() : undefined;
      const slotEndTime = typeof o.slotEndTime === "string" && o.slotEndTime.trim() ? o.slotEndTime.trim() : undefined;
      const sectionId = typeof o.sectionId === "string" && o.sectionId.trim() ? o.sectionId.trim() : undefined;
      const sectionName = typeof o.sectionName === "string" && o.sectionName.trim() ? o.sectionName.trim() : undefined;
      allocations.push({
        allocationDate,
        tableKey: tableKeyRaw,
        sectionIndex: typeof o.sectionIndex === "number" && Number.isInteger(o.sectionIndex) && o.sectionIndex >= 0 ? o.sectionIndex : 0,
        tableIndex: typeof o.tableIndex === "number" && Number.isInteger(o.tableIndex) && o.tableIndex >= 0 ? o.tableIndex : 0,
        bookingId: bookingIdRaw,
        guestName: guestName || undefined,
        guestCount: typeof o.guestCount === "number" && o.guestCount >= 0 ? o.guestCount : undefined,
        guestsAtThisTable,
        status: typeof o.status === "string" && (o.status === "running" || o.status === "paid") ? o.status : "running",
        slotStartTime,
        slotEndTime,
        sectionId,
        sectionName,
      });
    }

    if (allocations.length === 0) {
      res.status(400).json({ message: "No valid allocations in body" });
      return;
    }

    const connectionString = db.constants.connectionStrings.tableBooking;

    // Load table_master for capacity check
    const tableMasterDoc = await db.read.findOne({
      req,
      connectionString,
      collection: "table_master",
      query: { _id: TABLE_MASTER_CONFIG_ID },
    });
    const sections = (tableMasterDoc as { sections?: TableMasterSection[] } | null)?.sections ?? [];
    const capacityMap = buildTableCapacityMap(sections);

    // Existing allocations for this date (for capacity and duplicate check)
    const existing = (await db.read.find({
      req,
      connectionString,
      collection: "table_allocations",
      query: { allocationDate },
    })) as AllocationDoc[];

    const existingByKey = new Map<string, AllocationDoc>();
    for (const e of existing) {
      existingByKey.set(`${e.tableKey}\0${e.bookingId}`, e);
    }

    // Per-table total guests (existing)
    const tableTotals = new Map<string, number>();
    for (const e of existing) {
      const cur = tableTotals.get(e.tableKey) ?? 0;
      tableTotals.set(e.tableKey, cur + (e.guestsAtThisTable ?? 0));
    }

    // Pre-check: duplicate or over capacity
    for (const a of allocations) {
      const key = `${a.tableKey}\0${a.bookingId}`;
      const existingAlloc = existingByKey.get(key);
      if (existingAlloc) {
        const name = existingAlloc.allocatedByName ?? existingAlloc.allocatedBy ?? "another admin";
        res.status(409).json({
          message: `The booked user is already allocated by ${name}`,
          code: "ALREADY_ALLOCATED",
          allocatedByName: existingAlloc.allocatedByName,
        });
        return;
      }
      const cap = capacityMap.get(a.tableKey) ?? 0;
      const curTotal = tableTotals.get(a.tableKey) ?? 0;
      const newTotal = curTotal + a.guestsAtThisTable;
      if (newTotal > cap) {
        res.status(400).json({
          message: `Table ${a.tableKey} is full (requested ${a.guestsAtThisTable}, capacity ${cap})`,
        });
        return;
      }
      tableTotals.set(a.tableKey, newTotal);
    }

    // Update slot_inventory when allocating offline users with slot info (run at allocation, not payment)
    const offlineWithSlot = allocations.filter(
      (a) =>
        isOfflineBookingId(a.bookingId) &&
        a.slotStartTime &&
        a.slotEndTime &&
        a.sectionId
    );
    if (offlineWithSlot.length > 0) {
      const slotKey = (st: string, et: string, sid: string) => `${st}|${et}|${sid}`;
      const guestCountBySlot = new Map<string, number>();
      for (const a of offlineWithSlot) {
        const key = slotKey(a.slotStartTime!, a.slotEndTime!, a.sectionId!);
        const cur = guestCountBySlot.get(key) ?? 0;
        guestCountBySlot.set(key, cur + (a.guestsAtThisTable ?? 0));
      }
      const bookingDate = new Date(allocationDate + "T00:00:00.000Z");
      const totalSeats = await slotInventory.getTotalSeatsFromTableMaster(req);
      for (const [key, guestCount] of guestCountBySlot) {
        if (guestCount <= 0) continue;
        const [slotStartTime, slotEndTime, sectionIdStr] = key.split("|");
        let sectionId: ObjectId;
        try {
          sectionId = new ObjectId(sectionIdStr);
        } catch {
          res.status(400).json({ message: "Invalid sectionId for offline slot" });
          return;
        }
        await slotInventory.ensureSlotInventory({
          req,
          bookingDate,
          sectionId,
          slotStartTime,
          slotEndTime,
          totalSeats,
        });
        const allocated = await slotInventory.allocateSeats({
          req,
          bookingDate,
          sectionId,
          slotStartTime,
          slotEndTime,
          guestCount,
        });
        if (!allocated) {
          const remaining = await slotInventory.getRemainingSeats(req, bookingDate, sectionId, slotStartTime, slotEndTime);
          res.status(400).json({
            message: `Slot ${slotStartTime}–${slotEndTime} is full. Available only for ${remaining} guests.`,
          });
          return;
        }
      }
    }

    const now = new Date();
    const docs: Record<string, unknown>[] = allocations.map((a) => {
      const base: Record<string, unknown> = {
        allocationDate: a.allocationDate,
        tableKey: a.tableKey,
        sectionIndex: a.sectionIndex,
        tableIndex: a.tableIndex,
        bookingId: a.bookingId,
        guestName: a.guestName,
        guestCount: a.guestCount,
        guestsAtThisTable: a.guestsAtThisTable,
        status: a.status,
        allocatedBy,
        allocatedByName,
        createdAt: now,
        updatedAt: now,
      };
      if (a.slotStartTime != null) base.slotStartTime = a.slotStartTime;
      if (a.slotEndTime != null) base.slotEndTime = a.slotEndTime;
      if (a.sectionId != null) base.sectionId = a.sectionId;
      if (a.sectionName != null) base.sectionName = a.sectionName;
      return base;
    });

    try {
      await db.create.insertMany({
        req,
        connectionString,
        collection: "table_allocations",
        docs,
      });
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code;
      if (code === 11000) {
        const dup = await db.read.findOne({
          req,
          connectionString,
          collection: "table_allocations",
          query: {
            allocationDate,
            tableKey: allocations[0].tableKey,
            bookingId: allocations[0].bookingId,
          },
        }) as AllocationDoc | null;
        const name = dup?.allocatedByName ?? dup?.allocatedBy ?? "another admin";
        res.status(409).json({
          message: `The booked user is already allocated by ${name}`,
          code: "ALREADY_ALLOCATED",
          allocatedByName: dup?.allocatedByName,
        });
        return;
      }
      throw err;
    }

    res.status(200).json({ message: "Allocations created", count: docs.length });
  } catch (err) {
    logger.error("allocations.create.failed", { handler: "postTableAllocations", error: err instanceof Error ? err.message : "unknown" });
    res.status(500).json({ message: "Internal server error" });
  }
}

/** DELETE /admin/table-allocations?bookingId=xyz or DELETE /admin/table-allocations/:id */
export async function deleteTableAllocationsHandler(req: Request, res: Response): Promise<void> {
  try {
    const connectionString = db.constants.connectionStrings.tableBooking;
    const bookingId = typeof req.query.bookingId === "string" ? req.query.bookingId : undefined;
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (bookingId) {
      const sanitized = bookingId.trim().slice(0, MAX_BOOKING_ID_LENGTH);
      if (!sanitized) {
        res.status(400).json({ message: "Invalid bookingId" });
        return;
      }
      if (isOfflineBookingId(sanitized)) {
        const toDelete = (await db.read.find({
          req,
          connectionString,
          collection: "table_allocations",
          query: { bookingId: sanitized },
          limit: 100,
        })) as AllocationDoc[];
        const withSlot = toDelete.filter((a) => a.slotStartTime && a.slotEndTime && a.sectionId);
        if (withSlot.length > 0) {
          const allocationDate = withSlot[0].allocationDate;
          const bookingDate = new Date(allocationDate + "T00:00:00.000Z");
          const slotKey = (st: string, et: string, sid: string) => `${st}|${et}|${sid}`;
          const guestCountBySlot = new Map<string, number>();
          for (const a of withSlot) {
            const key = slotKey(a.slotStartTime!, a.slotEndTime!, a.sectionId!);
            const cur = guestCountBySlot.get(key) ?? 0;
            guestCountBySlot.set(key, cur + (a.guestsAtThisTable ?? 0));
          }
          for (const [key, guestCount] of guestCountBySlot) {
            if (guestCount <= 0) continue;
            const [slotStartTime, slotEndTime, sectionIdStr] = key.split("|");
            try {
              const sectionId = new ObjectId(sectionIdStr);
              await slotInventory.releaseSeats({
                req,
                bookingDate,
                sectionId,
                slotStartTime,
                slotEndTime,
                guestCount,
              });
            } catch {
              // best-effort release; continue
            }
          }
        }
      }
      const result = await db.deleteOp.deleteMany({
        req,
        connectionString,
        collection: "table_allocations",
        query: { bookingId: sanitized },
      });
      res.status(200).json({ message: "Allocations removed", deletedCount: result.deletedCount });
      return;
    }

    if (idParam && ObjectId.isValid(idParam)) {
      const result = await db.deleteOp.deleteOne({
        req,
        connectionString,
        collection: "table_allocations",
        query: { _id: new ObjectId(idParam) },
      });
      if (result.deletedCount === 0) {
        res.status(404).json({ message: "Allocation not found" });
        return;
      }
      res.status(200).json({ message: "Allocation removed" });
      return;
    }

    res.status(400).json({ message: "Provide query ?bookingId=... or path /:id" });
  } catch (err) {
    logger.error("allocations.delete.failed", { handler: "deleteTableAllocations", error: err instanceof Error ? err.message : "unknown" });
    res.status(500).json({ message: "Internal server error" });
  }
}

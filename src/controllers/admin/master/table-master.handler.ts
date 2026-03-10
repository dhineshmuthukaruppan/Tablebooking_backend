import type { Request, Response } from "express";
import db from "../../../databaseUtilities";

const CONFIG_ID = "config";

export interface TableRow {
  id: string;
  seats: number | null;
}

export interface TableMasterSection {
  id: string;
  name?: string;
  tables: TableRow[];
}

function isValidSections(body: unknown): body is TableMasterSection[] {
  if (!Array.isArray(body)) return false;
  for (const section of body) {
    if (section == null || typeof section !== "object") return false;
    if (typeof (section as TableMasterSection).id !== "string") return false;
    const tables = (section as TableMasterSection).tables;
    if (!Array.isArray(tables)) return false;
    for (const row of tables) {
      if (row == null || typeof row !== "object") return false;
      if (typeof (row as TableRow).id !== "string") return false;
      const seats = (row as TableRow).seats;
      if (seats !== null && (typeof seats !== "number" || Number.isNaN(seats))) return false;
    }
  }
  return true;
}

function normalizeSections(sections: TableMasterSection[]): TableMasterSection[] {
  return sections.map((sec) => ({
    id: String(sec.id),
    name: typeof sec.name === "string" ? sec.name.trim() || undefined : undefined,
    tables: (sec.tables || []).map((t) => ({
      id: String(t.id),
      seats: t.seats == null || Number.isNaN(Number(t.seats)) ? null : Number(t.seats),
    })),
  }));
}

/** Sum of all table seats across sections. Uses numeric seats only (handles number or string from DB). */
function computeTotalSeats(sections: TableMasterSection[]): number {
  let total = 0;
  for (const sec of sections) {
    for (const t of sec.tables || []) {
      const s = (t as { seats?: number | string | null }).seats;
      const n = typeof s === "number" && !Number.isNaN(s) ? s : Number(s);
      if (Number.isFinite(n) && n >= 0) total += n;
    }
  }
  return total;
}

export async function getTableMasterConfigHandler(req: Request, res: Response): Promise<void> {
  try {
    const connectionString = db.constants.connectionStrings.tableBooking;
    const doc = await db.read.findOne({
      req,
      connectionString,
      collection: "table_master",
      query: { _id: CONFIG_ID },
    });
    const sections = (doc as { sections?: TableMasterSection[] } | null)?.sections ?? [];
    const docTotal = (doc as { total_seats?: number } | null)?.total_seats;
    const totalSeats = typeof docTotal === "number" ? docTotal : computeTotalSeats(sections);
    res.status(200).json({ message: "Table master config", data: { sections, totalSeats } });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function putTableMasterConfigHandler(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as { sections?: unknown };
    if (!isValidSections(body.sections)) {
      res.status(400).json({ message: "Invalid body: sections must be an array of sections with id and tables" });
      return;
    }
    const sections = normalizeSections(body.sections as TableMasterSection[]);
    const totalSeats = computeTotalSeats(sections);
    const connectionString = db.constants.connectionStrings.tableBooking;
    await db.update.findOneAndUpdate({
      req,
      connectionString,
      collection: "table_master",
      query: { _id: CONFIG_ID },
      update: {
        $set: { sections, total_seats: totalSeats },
        $unset: { totalSeats: "", available_seats: "" },
      },
      options: { upsert: true },
    });
    res.status(200).json({ message: "Table master config saved", data: { sections, totalSeats } });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

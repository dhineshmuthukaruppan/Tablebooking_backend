import type { Request, Response } from "express";
import db from "../../../databaseUtilities";

const VENUE_CONFIG_ID = "default";

async function getVenueDoc(req: Request): Promise<{ locationTiming?: unknown; facilities?: string[] }> {
  const raw = await db.read.findOne({
    req,
    connectionString: db.constants.connectionStrings.tableBooking,
    collection: "venue_config",
    query: { _id: VENUE_CONFIG_ID },
  });
  return (raw as { locationTiming?: unknown; facilities?: string[] }) ?? {};
}

export async function getFacilitiesHandler(req: Request, res: Response): Promise<void> {
  try {
    const doc = await getVenueDoc(req);
    const facilities = Array.isArray(doc.facilities) ? doc.facilities : [];
    res.status(200).json({ message: "Facilities", data: facilities });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function putFacilitiesHandler(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as { facilities?: unknown };
    const facilitiesArray = Array.isArray(body.facilities) ? body.facilities : [];
    const facilities = facilitiesArray
      .map((f) => (typeof f === "string" ? f.trim() : String(f)))
      .filter((v) => v && v.trim().length > 0);

    if (facilities.length === 0) {
      res.status(400).json({ message: "At least one facility is required" });
      return;
    }
    const doc = await getVenueDoc(req);
    const locationTiming = doc.locationTiming ?? {};
    await db.update.updateOne({
      req,
      connectionString: db.constants.connectionStrings.tableBooking,
      collection: "venue_config",
      query: { _id: VENUE_CONFIG_ID },
      update: { $set: { _id: VENUE_CONFIG_ID, locationTiming, facilities } },
      options: { upsert: true },
    });
    res.status(200).json({ message: "Facilities updated", data: facilities });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

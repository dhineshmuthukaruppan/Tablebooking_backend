import type { Request, Response } from "express";
import db from "../../../databaseUtilities";

const VENUE_CONFIG_ID = "default";
const DEFAULT_VENUE_TIME_ZONE = "Asia/Dubai";

export interface LocationTimingDoc {
  address?: string;
  mapLink?: string;
  timingsText?: string;
  timezone?: string;
}

async function getVenueDoc(req: Request): Promise<{ locationTiming?: LocationTimingDoc; facilities?: string[] }> {
  const raw = await db.read.findOne({
    req,
    connectionString: db.constants.connectionStrings.tableBooking,
    collection: "venue_config",
    query: { _id: VENUE_CONFIG_ID },
  });
  return (raw as { locationTiming?: LocationTimingDoc; facilities?: string[] }) ?? {};
}

export async function getLocationTimingHandler(req: Request, res: Response): Promise<void> {
  try {
    const doc = await getVenueDoc(req);
    const locationTiming = doc.locationTiming ?? {};
    res.status(200).json({
      message: "Location and timing",
      data: {
        address: locationTiming.address ?? "",
        mapLink: locationTiming.mapLink ?? "",
        timingsText: locationTiming.timingsText ?? "",
        timezone: locationTiming.timezone?.trim() || DEFAULT_VENUE_TIME_ZONE,
      },
    });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function putLocationTimingHandler(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as {
      address?: string;
      mapLink?: string;
      timingsText?: string;
      timezone?: string;
    };
    const locationTiming: LocationTimingDoc = {
      address: typeof body.address === "string" ? body.address.trim() : "",
      mapLink: typeof body.mapLink === "string" ? body.mapLink.trim() : "",
      timingsText: typeof body.timingsText === "string" ? body.timingsText.trim() : "",
      timezone:
        typeof body.timezone === "string" && body.timezone.trim()
          ? body.timezone.trim()
          : DEFAULT_VENUE_TIME_ZONE,
    };
    const doc = await getVenueDoc(req);
    const facilities = Array.isArray(doc.facilities) ? doc.facilities : [];
    await db.update.updateOne({
      req,
      connectionString: db.constants.connectionStrings.tableBooking,
      collection: "venue_config",
      query: { _id: VENUE_CONFIG_ID },
      update: { $set: { _id: VENUE_CONFIG_ID, locationTiming, facilities } },
      options: { upsert: true },
    });
    res.status(200).json({ message: "Location and timing updated", data: locationTiming });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

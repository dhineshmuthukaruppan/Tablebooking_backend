import type { Request, Response } from "express";
import db from "../databaseUtilities";

const VENUE_CONFIG_ID = "default";

/** Public endpoint for landing page: returns location/timing and facilities. */
export async function getVenueConfigHandler(req: Request, res: Response): Promise<void> {
  try {
    const raw = await db.read.findOne({
      req,
      connectionString: db.constants.connectionStrings.tableBooking,
      collection: "venue_config",
      query: { _id: VENUE_CONFIG_ID },
    });
    const doc = (raw as { locationTiming?: unknown; facilities?: string[] }) ?? {};
    res.status(200).json({
      locationTiming: doc.locationTiming ?? { address: "", mapLink: "", timingsText: "", timezone: "" },
      facilities: Array.isArray(doc.facilities) ? doc.facilities : [],
    });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

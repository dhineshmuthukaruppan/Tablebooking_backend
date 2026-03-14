import type { Request, Response } from "express";
import {
  getGuestDatesConfig,
  isGuestDatesConfigError,
  updateGuestDatesConfig,
} from "../../../services/admin/guestDates.service";

export async function getGuestDatesConfigHandler(req: Request, res: Response): Promise<void> {
  try {
    const config = await getGuestDatesConfig(req);
    res.status(200).json({
      message: "Guest and dates config",
      data: config,
    });
  } catch (error) {
    if (isGuestDatesConfigError(error)) {
      res.status(error.statusCode).json({ message: error.message });
      return;
    }

    res.status(500).json({ message: "Internal server error" });
  }
}

export async function updateGuestDatesConfigHandler(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as {
      maxGuestCount?: number;
      maxDaysCount?: number;
      allowBookingWhenSlotFull?: boolean;
      adminEmail?: string | null;
    };
    const maxGuestCount = typeof body.maxGuestCount === "number" ? body.maxGuestCount : undefined;
    const maxDaysCount = typeof body.maxDaysCount === "number" ? body.maxDaysCount : undefined;
    const allowBookingWhenSlotFull =
      typeof body.allowBookingWhenSlotFull === "boolean" ? body.allowBookingWhenSlotFull : undefined;
    const adminEmail =
      typeof body.adminEmail === "string" || body.adminEmail === null
        ? body.adminEmail
        : undefined;

    const config = await updateGuestDatesConfig(req, {
      maxGuestCount,
      maxDaysCount,
      allowBookingWhenSlotFull,
      adminEmail,
    });

    res.status(200).json({
      message: "Guest and dates config updated",
      data: config,
    });
  } catch (error) {
    if (isGuestDatesConfigError(error)) {
      res.status(error.statusCode).json({ message: error.message });
      return;
    }

    res.status(500).json({ message: "Internal server error" });
  }
}

export async function updateGuestDatesAdminEmailHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const body = req.body as { adminEmail?: string | null };

    if (!Object.prototype.hasOwnProperty.call(body, "adminEmail")) {
      res.status(400).json({ message: "Provide adminEmail in request body." });
      return;
    }

    const config = await updateGuestDatesConfig(req, {
      adminEmail:
        typeof body.adminEmail === "string" || body.adminEmail === null
          ? body.adminEmail
          : null,
    });

    res.status(200).json({
      message: "Admin contact email updated",
      data: config,
    });
  } catch (error) {
    if (isGuestDatesConfigError(error)) {
      res.status(error.statusCode).json({ message: error.message });
      return;
    }

    res.status(500).json({ message: "Internal server error" });
  }
}

import type { Request, Response } from "express";
import {
  getGeneralMasterConfig,
  isGeneralMasterConfigError,
  updateGeneralMasterConfig,
} from "../../../services/admin/generalMaster.service";

export async function getGeneralMasterConfigHandler(req: Request, res: Response): Promise<void> {
  try {
    const config = await getGeneralMasterConfig(req);
    res.status(200).json({
      message: "General master config",
      data: config,
    });
  } catch (error) {
    if (isGeneralMasterConfigError(error)) {
      res.status(error.statusCode).json({ message: error.message });
      return;
    }

    res.status(500).json({ message: "Internal server error" });
  }
}

export async function updateGeneralMasterConfigHandler(req: Request, res: Response): Promise<void> {
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

    const config = await updateGeneralMasterConfig(req, {
      maxGuestCount,
      maxDaysCount,
      allowBookingWhenSlotFull,
      adminEmail,
    });

    res.status(200).json({
      message: "General master config updated",
      data: config,
    });
  } catch (error) {
    if (isGeneralMasterConfigError(error)) {
      res.status(error.statusCode).json({ message: error.message });
      return;
    }

    res.status(500).json({ message: "Internal server error" });
  }
}

export async function updateGeneralMasterAdminEmailHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const body = req.body as { adminEmail?: string | null };

    if (!Object.prototype.hasOwnProperty.call(body, "adminEmail")) {
      res.status(400).json({ message: "Provide adminEmail in request body." });
      return;
    }

    const config = await updateGeneralMasterConfig(req, {
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
    if (isGeneralMasterConfigError(error)) {
      res.status(error.statusCode).json({ message: error.message });
      return;
    }

    res.status(500).json({ message: "Internal server error" });
  }
}

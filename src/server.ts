import "./instrumentation";
import type { Application } from "express";
import { app } from "./app";
import { connectDatabase, getDb, getClient } from "./config/database";
import { env } from "./config/env";
import { logger } from "./config/logger";

const CONNECTION_KEY = "tableBooking";

function attachDatabaseToApp(appInstance: Application): void {
  (appInstance.locals as Record<string, unknown>)[CONNECTION_KEY + "DB"] = getDb();
  (appInstance.locals as Record<string, unknown>)[CONNECTION_KEY + "CLIENT"] = getClient();
}

async function bootstrap(): Promise<void> {
  try {

    console.log("environmental variables in server.ts", env);   

    await connectDatabase();
    attachDatabaseToApp(app);
    app.listen(env.PORT, () => {
      logger.info(`Backend running on http://localhost:${env.PORT}`);
    });
  } catch (error) {
    logger.error("Failed to start backend", error);
    process.exit(1);
  }
}

void bootstrap();

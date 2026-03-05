import "./instrumentation";
import { app } from "./app";
import { connectDatabase } from "./config/database";
import { env } from "./config/env";
import { logger } from "./config/logger";

async function bootstrap(): Promise<void> {
  try {
    await connectDatabase();
    app.listen(env.PORT, () => {
      logger.info(`Backend running on http://localhost:${env.PORT}`);
    });
  } catch (error) {
    logger.error("Failed to start backend", error);
    process.exit(1);
  }
}

void bootstrap();

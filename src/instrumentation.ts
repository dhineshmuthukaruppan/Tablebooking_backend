/**
 * OpenTelemetry instrumentation. Must run before other application code.
 * Set OTEL_EXPORTER_OTLP_ENDPOINT (e.g. http://localhost:4318/v1/traces) to export traces.
 */
import dotenv from "dotenv";
dotenv.config();
dotenv.config({ path: ".env.local", override: true });

const OTEL_ENABLED = process.env.OTEL_ENABLED !== "false";
const OTLP_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318/v1/traces";

if (OTEL_ENABLED) {
  try {
    const { NodeSDK } = require("@opentelemetry/sdk-node");
    const { OTLPTraceExporter } = require("@opentelemetry/exporter-trace-otlp-http");
    const { getNodeAutoInstrumentations } = require("@opentelemetry/auto-instrumentations-node");
    const { Resource } = require("@opentelemetry/resources");

    const resource = new Resource({
      "service.name": "tablebooking-backend",
    });

    const traceExporter = new OTLPTraceExporter({
      url: OTLP_ENDPOINT,
    });

    const sdk = new NodeSDK({
      resource,
      traceExporter,
      instrumentations: [getNodeAutoInstrumentations()],
    });

    sdk.start();
    process.on("SIGTERM", () => sdk.shutdown());
  } catch (err) {
    console.error("OpenTelemetry instrumentation failed to start:", err);
  }
}

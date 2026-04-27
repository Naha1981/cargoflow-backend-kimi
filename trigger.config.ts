import { defineConfig } from "@trigger.dev/sdk/v3";

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_ID || "proj_sqwhvsbomybtuvhneibb",
  runtime: "node",
  logLevel: process.env.NODE_ENV === "development" ? "debug" : "info",
  maxDuration: 300,
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 5,
      factor: 2,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 30000,
      randomize: true,
    },
  },
  build: {
    external: ["pg", "tesseract.js", "pdf-poppler", "bcrypt", "jsonwebtoken"],
  },
  queues: [
    { name: "ocr-queue", concurrencyLimit: 5 },
    { name: "ai-queue", concurrencyLimit: 10 },
    { name: "db-queue", concurrencyLimit: 20 },
    { name: "alerts-queue", concurrencyLimit: 10 },
    { name: "tracking-queue", concurrencyLimit: 5 },
    { name: "default", concurrencyLimit: 10 },
  ],
});

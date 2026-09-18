import test from "node:test";
import assert from "node:assert/strict";
import { sha256 } from "../dist/evidence/hash.js";
import { deriveInvestigationSignals } from "../dist/evidence/signals.js";

test("SHA-256 evidence hashes are deterministic", () => {
  assert.equal(
    sha256({ b: 2, a: 1 }),
    sha256({ a: 1, b: 2 })
  );
  assert.equal(sha256({ payload: "cargo" }).length, 64);
});

test("cross-source signals distinguish missing AIS from satellite evidence", () => {
  const evidence = [
    {
      id: "sat-1",
      source_type: "sentinel-1",
      confidence: "reported",
      payload_json: { products: [] }
    },
    {
      id: "ais-1",
      source_type: "ais",
      confidence: "inferred",
      payload_json: { status: "requires_credentials" }
    },
    {
      id: "tide-1",
      source_type: "tides",
      confidence: "reported",
      payload_json: { hourly: {} }
    }
  ];

  const signals = deriveInvestigationSignals(evidence, [
    {
      event_type: "weather-exception",
      event_at: new Date().toISOString(),
      evidence_ids: ["weather-1"]
    }
  ]);

  assert.equal(signals.length, 4);
  assert.ok(signals.some((s) => s.fact.includes("AIS provider coverage is not activated")));
  assert.ok(signals.some((s) => s.fact.includes("Cross-source coverage gap")));
  assert.ok(signals.some((s) => s.fact.includes("Marine conditions")));
  assert.ok(signals.some((s) => s.fact.includes("Weather exceptions")));
});

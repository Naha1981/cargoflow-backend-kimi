export type EvidenceSource =
  | "ais" | "sentinel-1" | "sentinel-2" | "weather" | "tides"
  | "earthquake" | "osm" | "aircraft" | "port-record" | "browser"
  | "document" | "manual";

export type EvidenceConfidence = "observed" | "reported" | "derived" | "inferred";

export interface InvestigationInput {
  title: string;
  query: string;
  latitude?: number;
  longitude?: number;
  startDate?: string;
  endDate?: string;
}

export interface EvidenceItemInput {
  sourceType: EvidenceSource;
  sourceUrl?: string;
  observedAt?: string;
  capturedAt?: string;
  title: string;
  payload: unknown;
  confidence: EvidenceConfidence;
  metadata?: Record<string, unknown>;
}

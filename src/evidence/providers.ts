const DEFAULT_TIMEOUT_MS = 20000;

async function getJson(url: string, init: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    if (!response.ok) throw new Error(response.status + " " + response.statusText + ": " + text.slice(0, 500));
    return text ? JSON.parse(text) : null;
  } finally {
    clearTimeout(timer);
  }
}

export async function geocodePlace(query: string): Promise<{ latitude: number; longitude: number; displayName: string } | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  const data = await getJson(url.toString(), {
    headers: { "User-Agent": "CargoIQ-Investigator/1.0 (NahaLabs)" }
  }) as Array<{ lat: string; lon: string; display_name: string }>;
  const hit = data[0];
  return hit ? { latitude: Number(hit.lat), longitude: Number(hit.lon), displayName: hit.display_name } : null;
}

export async function osmFeatures(latitude: number, longitude: number) {
  const d = 0.03;
  const bbox = [latitude - d, longitude - d, latitude + d, longitude + d].join(",");
  const query = "[out:json][timeout:20];(" +
    'node["amenity"](' + bbox + ");" +
    'way["man_made"](' + bbox + ");" +
    'way["industrial"](' + bbox + ");" +
    'way["harbour"](' + bbox + ");" +
    'node["place"](' + bbox + ");" +
    ");out center tags;";
  return {
    sourceType: "osm" as const,
    sourceUrl: "https://www.openstreetmap.org/",
    capturedAt: new Date().toISOString(),
    title: "OpenStreetMap infrastructure/features",
    payload: await getJson("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "CargoIQ-Investigator/1.0 (NahaLabs)"
      },
      body: new URLSearchParams({ data: query })
    }),
    confidence: "reported" as const,
    metadata: { latitude, longitude, bbox }
  };
}

export async function historicalWeather(latitude: number, longitude: number, startDate: string, endDate: string) {
  const url = new URL("https://archive-api.open-meteo.com/v1/archive");
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("start_date", startDate);
  url.searchParams.set("end_date", endDate);
  url.searchParams.set("hourly", [
    "temperature_2m","precipitation","rain","snowfall","wind_speed_10m",
    "wind_direction_10m","wind_gusts_10m","relative_humidity_2m",
    "surface_pressure","weather_code"
  ].join(","));
  url.searchParams.set("timezone", "UTC");
  return {
    sourceType: "weather" as const,
    sourceUrl: url.toString(),
    capturedAt: new Date().toISOString(),
    title: "Historical weather " + startDate + " to " + endDate,
    payload: await getJson(url.toString()),
    confidence: "reported" as const,
    metadata: { latitude, longitude, startDate, endDate, provider: "Open-Meteo" }
  };
}

export async function earthquakes(startDate: string, endDate: string, latitude?: number, longitude?: number) {
  const url = new URL("https://earthquake.usgs.gov/fdsnws/event/1/query");
  url.searchParams.set("format", "geojson");
  url.searchParams.set("starttime", startDate);
  url.searchParams.set("endtime", endDate);
  url.searchParams.set("orderby", "time");
  url.searchParams.set("limit", "2000");
  if (latitude !== undefined && longitude !== undefined) {
    url.searchParams.set("latitude", String(latitude));
    url.searchParams.set("longitude", String(longitude));
    url.searchParams.set("maxradiuskm", "500");
  }
  return {
    sourceType: "earthquake" as const,
    sourceUrl: url.toString(),
    capturedAt: new Date().toISOString(),
    title: "USGS earthquakes " + startDate + " to " + endDate,
    payload: await getJson(url.toString()),
    confidence: "reported" as const,
    metadata: { startDate, endDate, latitude, longitude }
  };
}

export async function aircraft(latitude: number, longitude: number) {
  const dLat = 1.5, dLon = 1.5;
  const url = new URL("https://opensky-network.org/api/states/all");
  url.searchParams.set("lamin", String(latitude - dLat));
  url.searchParams.set("lomin", String(longitude - dLon));
  url.searchParams.set("lamax", String(latitude + dLat));
  url.searchParams.set("lomax", String(longitude + dLon));
  return {
    sourceType: "aircraft" as const,
    sourceUrl: url.toString(),
    capturedAt: new Date().toISOString(),
    title: "OpenSky aircraft states near investigation area",
    payload: await getJson(url.toString()),
    confidence: "reported" as const,
    metadata: { latitude, longitude, dLat, dLon }
  };
}

export async function sentinelCatalog(startDate: string, endDate: string) {
  const filter = "Collection/Name eq 'SENTINEL-1' and ContentDate/Start gt " +
    startDate + "T00:00:00.000Z and ContentDate/Start lt " +
    endDate + "T23:59:59.999Z";
  const url = new URL("https://catalogue.dataspace.copernicus.eu/odata/v1/Products");
  url.searchParams.set("$filter", filter);
  url.searchParams.set("$orderby", "ContentDate/Start desc");
  url.searchParams.set("$top", "20");
  return {
    sourceType: "sentinel-1" as const,
    sourceUrl: url.toString(),
    capturedAt: new Date().toISOString(),
    title: "Copernicus Sentinel-1 catalogue hits " + startDate + " to " + endDate,
    payload: await getJson(url.toString()),
    confidence: "reported" as const,
    metadata: { startDate, endDate, downloadRequiresCopernicusAuth: true }
  };
}

export async function globalFishingWatchEvents(startDate: string, endDate: string, vesselId?: string) {
  const token = process.env.GFW_API_TOKEN;
  if (!token) {
    return {
      sourceType: "ais" as const,
      sourceUrl: "https://globalfishingwatch.org/our-apis/",
      capturedAt: new Date().toISOString(),
      title: "Global Fishing Watch AIS adapter not activated",
      payload: { status: "requires_credentials", requiredEnv: "GFW_API_TOKEN" },
      confidence: "inferred" as const,
      metadata: { datasets: ["public-global-port-visits-events:latest", "public-global-vessel-identity:latest"] }
    };
  }

  const url = new URL("https://gateway.api.globalfishingwatch.org/v3/events");
  url.searchParams.set("start-date", startDate);
  url.searchParams.set("end-date", endDate);
  url.searchParams.set("limit", "200");
  if (vesselId) url.searchParams.set("vessels[0]", vesselId);
  ["PORT_VISIT", "ENCOUNTER", "FISHING"].forEach((type, index) => url.searchParams.set("types[" + index + "]", type));
  ["public-global-port-visits-events:latest", "public-global-encounters-events:latest", "public-global-fishing-events:latest"]
    .forEach((dataset, index) => url.searchParams.set("datasets[" + index + "]", dataset));

  return {
    sourceType: "ais" as const,
    sourceUrl: url.toString(),
    capturedAt: new Date().toISOString(),
    title: "Global Fishing Watch maritime events " + startDate + " to " + endDate,
    payload: await getJson(url.toString(), { headers: { Authorization: "Bearer " + token } }),
    confidence: "reported" as const,
    metadata: { provider: "Global Fishing Watch", vesselId }
  };
}

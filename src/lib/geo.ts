/**
 * Helpers de geolocalização e cálculo de distância/tempo.
 * Usa Haversine para distância (sem dependência externa) e
 * Nominatim (OpenStreetMap) para geocoding (grátis, com rate limit).
 */

export type LatLng = { lat: number; lng: number };

export type AddressInput = {
  street: string;
  number: string;
  complement?: string | null;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
};

export type GeocodedAddress = AddressInput & LatLng & {
  displayName: string;
};

// === Distância (Haversine) ===
const EARTH_RADIUS_KM = 6371;

function toRad(value: number): number {
  return (value * Math.PI) / 180;
}

export function distanceKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** Estima tempo em minutos dada distância (km) e velocidade média (km/h) */
export function estimateMinutes(distanceKm: number, avgSpeedKmh: number): number {
  if (avgSpeedKmh <= 0) return 0;
  return Math.ceil((distanceKm / avgSpeedKmh) * 60);
}

// === Cálculo de taxa de entrega ===
export type DeliveryFeeInput = {
  distanceKm: number;
  baseFee: number;
  feePerKm: number;
  minFee: number;
  maxFee: number;
};

export function calculateDeliveryFee({
  distanceKm,
  baseFee,
  feePerKm,
  minFee,
  maxFee,
}: DeliveryFeeInput): number {
  const raw = baseFee + distanceKm * feePerKm;
  const clamped = Math.max(minFee, Math.min(raw, maxFee));
  return Math.round(clamped * 100) / 100;
}

// === Geocoding (Nominatim - OSM) ===
// Limite: 1 req/s + User-Agent obrigatório. Para volumes altos,
// recomenda-se cachear (aqui usamos cache in-memory simples).
const geocodeCache = new Map<string, GeocodedAddress | null>();
let lastGeocodeAt = 0;
const MIN_INTERVAL_MS = 1100; // >= 1s p/ respeitar Nominatim

async function throttle() {
  const now = Date.now();
  const wait = lastGeocodeAt + MIN_INTERVAL_MS - now;
  if (wait > 0) {
    await new Promise((r) => setTimeout(r, wait));
  }
  lastGeocodeAt = Date.now();
}

export async function geocodeAddress(
  addr: AddressInput
): Promise<GeocodedAddress | null> {
  const query = `${addr.street}, ${addr.number}${addr.complement ? ` - ${addr.complement}` : ""}, ${addr.neighborhood}, ${addr.city}, ${addr.state}, ${addr.zipCode}, Brasil`;
  const key = query.toLowerCase().trim();
  if (geocodeCache.has(key)) return geocodeCache.get(key) ?? null;

  await throttle();
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", query);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");
    url.searchParams.set("countrycodes", "br");
    const res = await fetch(url.toString(), {
      headers: {
        // Nominatim exige um User-Agent identificável.
        "User-Agent": "DeliciasDasEstacoes/1.0 (delivery-food app)",
        "Accept-Language": "pt-BR",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      geocodeCache.set(key, null);
      return null;
    }
    const data = (await res.json()) as Array<{
      lat: string;
      lon: string;
      display_name: string;
    }>;
    if (!data || data.length === 0) {
      geocodeCache.set(key, null);
      return null;
    }
    const hit = data[0];
    const result: GeocodedAddress = {
      ...addr,
      lat: parseFloat(hit.lat),
      lng: parseFloat(hit.lon),
      displayName: hit.display_name,
    };
    geocodeCache.set(key, result);
    return result;
  } catch {
    geocodeCache.set(key, null);
    return null;
  }
}

/** Geocoding reverso (lat/lng → endereço). Usado para mostrar o nome da rua. */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  await throttle();
  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lng));
    url.searchParams.set("format", "json");
    url.searchParams.set("accept-language", "pt-BR");
    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": "DeliciasDasEstacoes/1.0 (delivery-food app)",
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { display_name?: string };
    return data.display_name ?? null;
  } catch {
    return null;
  }
}

// === Rota real por ruas (OSRM - OpenStreetMap) ===
// Calcula a distância/tempo seguindo as ruas (via driving), em vez da
// linha reta do Haversine. Servidor público/demo sem chave; há cache
// in-memory e fallback para Haversine caso não responda.
export type OsrmRoute = {
  distanceKm: number;
  durationMin: number;
  geometry: LatLng[];
};

const osrmCache = new Map<string, OsrmRoute>();

/**
 * Consulta o OSRM por uma rota dirigível entre dois pontos.
 * Retorna `null` quando o serviço não responde (fallback Haversine).
 */
export async function getRoadRoute(
  a: LatLng,
  b: LatLng,
  timeoutMs = 5000
): Promise<OsrmRoute | null> {
  const key = `${a.lat.toFixed(5)},${a.lng.toFixed(5)}|${b.lat.toFixed(5)},${b.lng.toFixed(5)}`;
  const cached = osrmCache.get(key);
  if (cached) return cached;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // OSRM usa a ordem "lng,lat" e espera as coordenadas após a barra
    const url = new URL("https://router.project-osrm.org/route/v1/driving");
    url.pathname += `/${a.lng},${a.lat};${b.lng},${b.lat}`;
    url.searchParams.set("overview", "full");
    url.searchParams.set("geometries", "geojson");
    url.searchParams.set("steps", "false");
    url.searchParams.set("alternatives", "false");
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      code?: string;
      routes?: Array<{
        distance?: number;
        duration?: number;
        geometry?: { coordinates?: Array<[number, number]> };
      }>;
    };
    const route = data.routes?.[0];
    if (!route || typeof route.distance !== "number" || typeof route.duration !== "number") {
      return null;
    }
    const result: OsrmRoute = {
      distanceKm: route.distance / 1000,
      durationMin: route.duration / 60,
      geometry: (route.geometry?.coordinates ?? []).map(([lng, lat]) => ({ lat, lng })),
    };
    osrmCache.set(key, result);
    return result;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
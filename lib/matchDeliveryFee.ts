/**
 * Match a delivery address (lat/lng) to the nearest delivery_fees zone.
 * Zone centers are resolved by geocoding area_name (no DB schema change).
 */

export type DeliveryFeeLike = {
  id: string;
  area_name: string;
  fee_amount: number;
};

export type FeeCenter = {
  id: string;
  area_name: string;
  fee_amount: number;
  lat: number;
  lng: number;
};

const NOMINATIM_UA = "PhoenixPrint/1.0";
/** Reject matches farther than this (km) — outside known Basra service area. */
export const MAX_ZONE_DISTANCE_KM = 35;

const centerCache = new Map<string, { lat: number; lng: number } | null>();

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function geocodeAreaName(areaName: string): Promise<{ lat: number; lng: number } | null> {
  const key = areaName.trim();
  if (!key) return null;
  if (centerCache.has(key)) return centerCache.get(key) ?? null;

  const queries = [
    `${key}, البصرة, العراق`,
    `${key}, محافظة البصرة, العراق`,
    `${key}, العراق`,
  ];

  for (const q of queries) {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&countrycodes=iq&limit=1`,
        { headers: { "User-Agent": NOMINATIM_UA } }
      );
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data) && data[0]?.lat && data[0]?.lon) {
        const point = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        centerCache.set(key, point);
        return point;
      }
    } catch {
      // try next query
    }
    await new Promise((r) => setTimeout(r, 1100));
  }

  centerCache.set(key, null);
  return null;
}

/** Resolve lat/lng centers for each delivery fee (cached). */
export async function resolveDeliveryFeeCenters(
  fees: DeliveryFeeLike[]
): Promise<FeeCenter[]> {
  const centers: FeeCenter[] = [];
  for (const fee of fees) {
    const point = await geocodeAreaName(fee.area_name);
    if (point) {
      centers.push({
        id: fee.id,
        area_name: fee.area_name,
        fee_amount: fee.fee_amount,
        lat: point.lat,
        lng: point.lng,
      });
    }
  }
  return centers;
}

/**
 * Prefer name hit inside formatted address / area / city, else nearest by coordinates.
 */
export function matchDeliveryFeeForAddress(params: {
  latitude: number;
  longitude: number;
  area?: string | null;
  city?: string | null;
  formattedAddress?: string | null;
  fees: DeliveryFeeLike[];
  centers: FeeCenter[];
  maxDistanceKm?: number;
}): DeliveryFeeLike | null {
  const {
    latitude,
    longitude,
    area,
    city,
    formattedAddress,
    fees,
    centers,
    maxDistanceKm = MAX_ZONE_DISTANCE_KM,
  } = params;

  const haystack = [formattedAddress, area, city]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  // Prefer specific place-name hits. Skip bare "البصرة" when it only appears
  // inside "محافظة البصرة" so generic governorate text does not beat nearest-district.
  const nameHits = fees
    .map((f) => {
      const name = (f.area_name || "").trim().toLowerCase();
      if (!name || !haystack.includes(name)) return null;
      if (name === "البصرة" || name === "البصره") {
        const withoutGov = haystack
          .replace(/محافظة\s*البصرة/g, " ")
          .replace(/محافظة\s*البصره/g, " ");
        if (!withoutGov.includes(name)) return null;
      }
      return f;
    })
    .filter((f): f is DeliveryFeeLike => !!f)
    .sort((a, b) => b.area_name.length - a.area_name.length);

  if (nameHits.length > 0) {
    return nameHits[0];
  }

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || centers.length === 0) {
    return null;
  }

  let best: FeeCenter | null = null;
  let bestDist = Infinity;
  for (const c of centers) {
    const d = haversineKm(latitude, longitude, c.lat, c.lng);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }

  if (!best || bestDist > maxDistanceKm) return null;

  return fees.find((f) => f.id === best!.id) ?? {
    id: best.id,
    area_name: best.area_name,
    fee_amount: best.fee_amount,
  };
}

/**
 * SeaLagom tools: the API-backed helpers. Ports, distances between ports, the route check and the
 * weather. They call www.sealagom.com; some need a key (https://www.sealagom.com/profile/?tab=api,
 * or sign in with GitHub). Plan limits apply; when a call needs more, the answer carries `upgrade`.
 */
export const BASE = "https://www.sealagom.com";

async function get(path, params = {}, key) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") q.append(k, String(v));
  const r = await fetch(`${BASE}${path}${q.toString() ? `?${q}` : ""}`, { headers: key ? { "X-API-Token": key } : {} });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.detail || r.statusText), { status: r.status, upgrade: data.upgrade });
  return data;
}

/** Port search: name, UN/LOCODE or country; rank sorts the biggest first. No key needed. */
export function searchPorts(q, { country, page = 1, pageSize = 20, key } = {}) {
  return get("/api/v2/ports/", { q, country, sort: "rank", page, page_size: pageSize }, key);
}

/** One port: VTS, pilotage, limits, anchorages, terminals. No key needed. */
export function port(slug, key) {
  return get(`/api/v2/ports/${encodeURIComponent(slug)}/`, {}, key);
}

/** Sea distance between two ports (slugs) along shared ECDIS routes. No key needed. */
export function portDistance(fromSlug, toSlug, key) {
  return get("/api/v2/port-distances/", { from: fromSlug, to: toSlug }, key);
}

/** Rescue centres and DSC coast stations near a position. No key needed. */
export function stationsNear(lat, lon, radiusNm = 200, key) {
  return get("/api/v2/stations/near/", { lat, lon, radius_nm: radiusNm }, key);
}

/** Warnings in force within radius NM of a position. No key needed. */
export function warningsNear(lat, lon, radiusNm = 30, key) {
  return get("/api/v2/near/", { lat, lon, radius_nm: radiusNm }, key);
}

/** Wind, sea and the forecast at a position and time. Needs a key. */
export function weatherAt(lat, lon, { time, key } = {}) {
  return get("/api/map/weather/", { lat, lon, time }, key);
}

/**
 * Route analysis: the NAVAREAs crossed and every warning within the corridor, with distance along
 * and the ETA verdict; `weather: true` adds the weather at each waypoint's ETA. Needs a key.
 */
export async function analyseRoute(waypoints, { speedKn = 12, corridorNm = 10, departure, weather = false, key } = {}) {
  const body = { waypoints: waypoints.map((p) => (Array.isArray(p) ? { lat: p[0], lon: p[1] } : p)), speed_kn: speedKn, corridor_nm: corridorNm };
  if (departure) body.departure = departure;
  const r = await fetch(`${BASE}/api/v2/route/`, { method: "POST", headers: { "X-API-Token": key || "", "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(result.detail || r.statusText), { status: r.status, upgrade: result.upgrade });
  if (weather) {
    const { routeLegs } = await import("./navigation.mjs");
    const pts = body.waypoints;
    const legs = routeLegs(pts);
    const dep = departure ? new Date(departure) : new Date();
    result.weather = [];
    for (let i = 0; i < pts.length; i++) {
      const along = i === 0 ? 0 : legs[i - 1].along;
      const at = new Date(dep.getTime() + (along / speedKn) * 3_600_000);
      try {
        const w = await weatherAt(pts[i].lat, pts[i].lon, { time: at.toISOString(), key });
        result.weather.push({ waypoint: i, along_nm: Math.round(along * 10) / 10, eta: at.toISOString(), ...(w.at || {}) });
      } catch (e) {
        result.weather.push({ waypoint: i, along_nm: Math.round(along * 10) / 10, eta: at.toISOString(), error: e.message, upgrade: e.upgrade });
      }
    }
  }
  return result;
}

/** A vessel by name, call sign or MMSI: the warnings naming it, its rows (name, MMSI, call sign), stations with that MMSI, AIS when on. */
export function findVessel(q, key) {
  return get("/api/v2/vessels/", { q, limit: 50 }, key);
}

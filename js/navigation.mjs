/**
 * SeaLagom tools: navigation arithmetic. Pure functions, no dependencies, Node and browsers.
 *
 *   import { greatCircle, rhumbLine, eta, speedForEta, trueWind, apparentWind, beaufort, routeLength } from "./navigation.mjs";
 *
 * Positions are { lat, lon } in decimal degrees (north and east positive). Distances in nautical
 * miles, courses in degrees true (0..360), speeds in knots, times as Date or ISO strings.
 */

const R_NM = 3440.065; // Earth radius in nautical miles (mean)
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
export const norm360 = (d) => ((d % 360) + 360) % 360;
/** Signed difference a - b in (-180, 180]. */
export const signed = (a) => {
  const x = norm360(a);
  return x > 180 ? x - 360 : x;
};

/** Great-circle distance (NM) and initial course (degrees true) from a to b. */
export function greatCircle(a, b) {
  const φ1 = rad(a.lat), φ2 = rad(b.lat), Δλ = rad(b.lon - a.lon);
  const s = Math.sin((φ2 - φ1) / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const distance = 2 * R_NM * Math.asin(Math.min(1, Math.sqrt(s)));
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return { distance, course: norm360(deg(Math.atan2(y, x))) };
}

/** Rhumb-line (constant course) distance (NM) and course (degrees true) from a to b. */
export function rhumbLine(a, b) {
  const φ1 = rad(a.lat), φ2 = rad(b.lat);
  let Δλ = rad(b.lon - a.lon);
  if (Math.abs(Δλ) > Math.PI) Δλ = Δλ > 0 ? Δλ - 2 * Math.PI : Δλ + 2 * Math.PI; // the short way round
  const Δψ = Math.log(Math.tan(Math.PI / 4 + φ2 / 2) / Math.tan(Math.PI / 4 + φ1 / 2));
  const q = Math.abs(Δψ) > 1e-12 ? (φ2 - φ1) / Δψ : Math.cos(φ1);
  const distance = Math.sqrt((φ2 - φ1) ** 2 + q * q * Δλ * Δλ) * R_NM;
  return { distance, course: norm360(deg(Math.atan2(Δλ, Δψ))) };
}

/** Position reached from a on a rhumb-line course after distance NM. */
export function rhumbDestination(a, course, distance) {
  const δ = distance / R_NM, θ = rad(course), φ1 = rad(a.lat), λ1 = rad(a.lon);
  const Δφ = δ * Math.cos(θ);
  let φ2 = φ1 + Δφ;
  if (Math.abs(φ2) > Math.PI / 2) φ2 = φ2 > 0 ? Math.PI - φ2 : -Math.PI - φ2;
  const Δψ = Math.log(Math.tan(φ2 / 2 + Math.PI / 4) / Math.tan(φ1 / 2 + Math.PI / 4));
  const q = Math.abs(Δψ) > 1e-12 ? Δφ / Δψ : Math.cos(φ1);
  const λ2 = λ1 + (δ * Math.sin(θ)) / q;
  return { lat: deg(φ2), lon: ((deg(λ2) + 540) % 360) - 180 };
}

/** Total length (NM) of a route as its legs are sailed: "RL" (rhumb line, default) or "GC". */
export function routeLength(points, legTypes) {
  let nm = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const gc = legTypes?.[i] === "GC";
    nm += (gc ? greatCircle : rhumbLine)(points[i], points[i + 1]).distance;
  }
  return nm;
}

/** Legs of a route with distance, course and the cumulative distance at each waypoint. */
export function routeLegs(points, legTypes) {
  const legs = [];
  let along = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const gc = legTypes?.[i] === "GC";
    const { distance, course } = (gc ? greatCircle : rhumbLine)(points[i], points[i + 1]);
    along += distance;
    legs.push({ from: i, to: i + 1, type: gc ? "GC" : "RL", distance, course, along });
  }
  return legs;
}

/** ETA from a departure, a distance and a speed. Returns { eta: Date, hours }. */
export function eta(departure, distanceNm, speedKn) {
  if (!(speedKn > 0)) throw new RangeError("speed must be above 0 kn");
  const dep = departure instanceof Date ? departure : new Date(departure);
  const hours = distanceNm / speedKn;
  return { eta: new Date(dep.getTime() + hours * 3_600_000), hours };
}

/** The speed (kn) needed to cover distance NM between departure and the wanted arrival. */
export function speedForEta(departure, arrival, distanceNm) {
  const dep = departure instanceof Date ? departure : new Date(departure);
  const arr = arrival instanceof Date ? arrival : new Date(arrival);
  const hours = (arr.getTime() - dep.getTime()) / 3_600_000;
  if (!(hours > 0)) throw new RangeError("arrival must be after departure");
  return { speed: distanceNm / hours, hours };
}

/** Distance run (NM) between two positions reported at two times, and the speed made good. */
export function distanceRun(a, timeA, b, timeB) {
  const { distance, course } = rhumbLine(a, b);
  const hours = (new Date(timeB).getTime() - new Date(timeA).getTime()) / 3_600_000;
  return { distance, course, hours, speedMadeGood: hours > 0 ? distance / hours : null };
}

/**
 * True wind from apparent: heading (°T), ship speed (kn), apparent wind angle (° relative, starboard
 * positive) and apparent wind speed (kn). Returns { tws, twd, twa }: speed, direction the wind comes
 * from (°T) and angle relative to the heading.
 */
export function trueWind(heading, sog, awa, aws) {
  const aDir = rad(norm360(heading + awa));
  const x = aws * Math.sin(aDir) - sog * Math.sin(rad(heading));
  const y = aws * Math.cos(aDir) - sog * Math.cos(rad(heading));
  const tws = Math.hypot(x, y);
  const twd = norm360(deg(Math.atan2(x, y)));
  return { tws, twd, twa: signed(twd - heading) };
}

/** Apparent wind from true: heading (°T), ship speed (kn), true wind direction (°T) and speed (kn). */
export function apparentWind(heading, sog, twd, tws) {
  const x = tws * Math.sin(rad(twd)) + sog * Math.sin(rad(heading));
  const y = tws * Math.cos(rad(twd)) + sog * Math.cos(rad(heading));
  const aws = Math.hypot(x, y);
  const awd = norm360(deg(Math.atan2(x, y)));
  return { aws, awd, awa: signed(awd - heading) };
}

const BEAUFORT = [1, 3, 6, 10, 16, 21, 27, 33, 40, 47, 55, 63];
/** Beaufort force for a wind speed in knots (0..12). */
export function beaufort(knots) {
  let f = 0;
  while (f < 12 && knots >= BEAUFORT[f]) f++;
  return f;
}

/** Nautical time zone from a longitude: the offset in hours (east positive) and the zone letter. */
export function zoneFromLongitude(lon) {
  const offset = Math.round(lon / 15);
  const letters = "ZABCDEFGHIKLMNOPQRSTUVWXY"; // Z = 0, A..M east (no J), N..Y west
  const letter = offset === 0 ? "Z" : offset > 0 ? "ABCDEFGHIKLM"[offset - 1] : "NOPQRSTUVWXY"[-offset - 1];
  return { offset, letter: letter ?? "?" };
}

/** Degrees and minutes text, e.g. 36-08.40N 005-21.20W. */
export function formatPosition({ lat, lon }, decimals = 2) {
  const dm = (v, pos, neg, width) => {
    const h = v >= 0 ? pos : neg;
    const a = Math.abs(v);
    const d = Math.floor(a);
    const m = ((a - d) * 60).toFixed(decimals).padStart(3 + decimals, "0");
    return `${String(d).padStart(width, "0")}-${m}${h}`;
  };
  return `${dm(lat, "N", "S", 2)} ${dm(lon, "E", "W", 3)}`;
}

/** Parse "36-08.4N 005-21.2W", "36°08.4'N", "36.14 -5.35", "3608.4N 00521.2W" into { lat, lon }. */
export function parsePosition(text) {
  const t = String(text).trim().toUpperCase().replace(/[°º]/g, "-").replace(/['′]/g, "");
  const dec = t.match(/^(-?\d+(?:\.\d+)?)[ ,;]+(-?\d+(?:\.\d+)?)$/);
  if (dec) return { lat: Number(dec[1]), lon: Number(dec[2]) };
  const re = /(\d{1,3})[- ]?(\d{1,2}(?:\.\d+)?)?\s*([NS])[ ,;]+(\d{1,3})[- ]?(\d{1,2}(?:\.\d+)?)?\s*([EW])/;
  const m = t.match(re);
  if (!m) {
    const packed = t.match(/^(\d{2})(\d{2}(?:\.\d+)?)([NS])[ ,;]+(\d{3})(\d{2}(?:\.\d+)?)([EW])$/);
    if (!packed) return null;
    const lat = Number(packed[1]) + Number(packed[2]) / 60, lon = Number(packed[4]) + Number(packed[5]) / 60;
    return { lat: packed[3] === "S" ? -lat : lat, lon: packed[6] === "W" ? -lon : lon };
  }
  const lat = Number(m[1]) + Number(m[2] || 0) / 60, lon = Number(m[4]) + Number(m[5] || 0) / 60;
  return { lat: m[3] === "S" ? -lat : lat, lon: m[6] === "W" ? -lon : lon };
}

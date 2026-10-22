/**
 * Pure helpers for a SeaLagom Telegram bot: parsing a command line and formatting an API answer
 * into chat text. No network here, so these are the testable part of telegram/bot.mjs.
 */

/** "/near 36.1 -5.4 30" -> { cmd: "near", args: "36.1 -5.4 30" }; null when the text is not a command. */
export function parseCommand(text) {
  const m = /^\/(\w+)(?:@\w+)?\s*(.*)$/s.exec((text || "").trim());
  if (!m) return null;
  return { cmd: m[1].toLowerCase(), args: m[2].trim() };
}

/** "36.1 -5.4 30" -> [36.1, -5.4, 30]; throws a plain message when a number is missing or not finite. */
export function parseNumbers(args, count, names) {
  const parts = (args || "").split(/\s+/).filter(Boolean).map(Number);
  for (let i = 0; i < count; i++) {
    if (!Number.isFinite(parts[i])) {
      throw new Error(`${names?.[i] || `argument ${i + 1}`} is missing or not a number.`);
    }
  }
  return parts;
}

/** "51.0,1.5;36.1,-5.4" -> [[51.0, 1.5], [36.1, -5.4]]; throws on a malformed point. */
export function parseWaypoints(text) {
  const points = (text || "").split(";").map((s) => s.trim()).filter(Boolean);
  if (points.length < 2) throw new Error("Give at least two points: lat,lon;lat,lon;...");
  return points.map((p) => {
    const [lat, lon] = p.split(",").map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error(`Not a position: ${p}`);
    return [lat, lon];
  });
}

const SEVERITY_MARK = { critical: "\u{1f534}", high: "\u{1f7e0}", medium: "\u{1f7e1}", low: "" };

/** A list of warnings (the shape /api/v2/near/ and /api/v2/vessels/ return) into chat lines. */
export function formatWarnings(list, { limit = 8, empty = "Nothing in force there." } = {}) {
  const rows = Array.isArray(list) ? list : list?.results || list?.warnings || [];
  if (!rows.length) return empty;
  const lines = rows.slice(0, limit).map((w) => {
    const mark = SEVERITY_MARK[(w.severity || "").toLowerCase()] || "";
    const where = w.navarea_title || w.region || w.navarea || w.coastal || "";
    const title = (w.title || w.summary || "").toString().slice(0, 90);
    return `${mark} ${[where, w.number].filter(Boolean).join(" ")}: ${title}`.trim();
  });
  const more = rows.length > limit ? `\n...and ${rows.length - limit} more` : "";
  return lines.join("\n") + more;
}

/** One port record (the shape /api/v2/ports/<slug>/ returns) into a short chat card. */
export function formatPort(p) {
  if (!p) return "No port by that name.";
  const bits = [p.name || p.title];
  if (p.country_code) bits[0] += ` (${p.country_code})`;
  if (p.max_draft_m) bits.push(`Max draft ${p.max_draft_m} m`);
  if (p.vts_vhf) bits.push(`VTS/VHF: ${String(p.vts_vhf).slice(0, 200)}`);
  if (p.description) bits.push(String(p.description).slice(0, 400));
  return bits.filter(Boolean).join("\n");
}

/** A vessel search result (/api/v2/vessels/) into chat text. */
export function formatVessel(r) {
  const rows = r?.rows || r?.vessels || [];
  const warnings = r?.warnings || r?.results || [];
  if (!rows.length && !warnings.length) return "No vessel or warning naming it found.";
  const parts = [];
  if (rows.length) parts.push(rows.slice(0, 5).map((v) => `${v.name || ""} MMSI ${v.mmsi || "?"} ${v.call_sign ? `(${v.call_sign})` : ""}`.trim()).join("\n"));
  if (warnings.length) parts.push(formatWarnings(warnings, { empty: "" }));
  return parts.filter(Boolean).join("\n\n") || "No vessel or warning naming it found.";
}

/** Rescue centres / DSC stations (/api/v2/stations/near/) into chat text. */
export function formatStations(r) {
  const rows = r?.results || r?.stations || [];
  if (!rows.length) return "No rescue centre or DSC station listed that near.";
  return rows.slice(0, 6).map((s) => `${s.name || s.country || ""} ${s.distance_nm ? `(${Math.round(s.distance_nm)} NM)` : ""}${s.mmsi ? ` MMSI ${s.mmsi}` : ""}`.trim()).join("\n");
}

/** Weather at a position (/api/map/weather/) into one readable line. */
export function formatWeather(r) {
  const at = r?.at || r;
  if (!at || (at.wind_speed_kn == null && at.wave_height_m == null)) return "No forecast for that position and time.";
  const bits = [];
  if (at.wind_speed_kn != null) bits.push(`Wind ${Math.round(at.wind_speed_kn)} kn${at.wind_dir_deg != null ? ` from ${Math.round(at.wind_dir_deg)}°` : ""}`);
  if (at.wave_height_m != null) bits.push(`Sea ${at.wave_height_m} m`);
  if (at.air_temp_c != null) bits.push(`Air ${at.air_temp_c}°C`);
  return bits.join(", ") || "No forecast for that position and time.";
}

/** A route check result (/api/v2/route/) into one summary line. */
export function formatRoute(r) {
  if (!r) return "The route could not be checked.";
  const zones = (r.navareas || []).map((z) => z.name || z.title).filter(Boolean).join(", ") || "none crossed";
  const count = r.count ?? (r.warnings || []).length ?? 0;
  return `${r.route_nm ?? "?"} NM through ${zones}. ${count} warning(s) in the ${r.corridor_nm ?? ""} NM corridor.`;
}

/** A thrown API error (api.mjs throws Error with .status/.upgrade) into one chat-friendly line. */
export function formatError(e) {
  if (e?.upgrade) return `That needs a plan: ${e.message}`;
  if (e?.status === 404) return "Nothing found.";
  return `Could not do that: ${e?.message || e}`;
}

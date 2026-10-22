/**
 * SeaLagom tools: route files in the browser or Node. No dependencies (uses DOMParser in the
 * browser; pass a parser for Node, e.g. from "@xmldom/xmldom", or use parseRouteText for CSV/NMEA).
 *
 *   import { parseRoute } from "./route-files.mjs";
 *   const route = parseRoute(fileName, text);   // { name, waypoints: [{ lat, lon, name, legType }], format }
 *
 * Formats: RTZ (IEC 61174, also .rt3 inside a zip is not handled here), GPX (rte or trk), KML
 * (LineString or Placemark points), CSV / TXT waypoint lists, NMEA 0183 $..WPL / $..RTE sentences.
 */

/**
 * XML without a DOM (Node, workers): a small element scanner that understands what route files use:
 * elements, attributes and text. Browsers use DOMParser; pass your own parser as the third argument
 * to override either.
 */
function miniXml(text) {
  const src = String(text).replace(/<\?[\s\S]*?\?>/g, "").replace(/<!--[\s\S]*?-->/g, "");
  const tagRe = /<\/?([A-Za-z_][\w.:-]*)((?:\s+[\w.:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
  const root = { localName: "#root", attrs: {}, children: [], text: "" };
  const stack = [root];
  let last = 0, m;
  while ((m = tagRe.exec(src))) {
    const parent = stack[stack.length - 1];
    parent.text += src.slice(last, m.index);
    last = tagRe.lastIndex;
    if (m[0].startsWith("</")) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const attrs = {};
    for (const a of m[2].matchAll(/([\w.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1].split(":").pop()] = a[2] ?? a[3];
    const el = { localName: m[1].split(":").pop(), attrs, children: [], text: "", parent };
    parent.children.push(el);
    if (!m[3]) stack.push(el);
  }
  const wrap = (el) => ({
    localName: el.localName,
    getAttribute: (k) => (k in el.attrs ? el.attrs[k] : null),
    get textContent() {
      return el.text + el.children.map((c) => wrap(c).textContent).join("");
    },
    getElementsByTagName: () => {
      const out = [];
      const walk = (n) => n.children.forEach((c) => { out.push(wrap(c)); walk(c); });
      walk(el);
      return out;
    },
  });
  return wrap(root);
}

function parseXml(text, parser) {
  if (parser) return parser(text);
  if (typeof DOMParser !== "undefined") return new DOMParser().parseFromString(text, "application/xml");
  return miniXml(text);
}

const num = (v) => {
  const n = Number(String(v ?? "").trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

function byTag(doc, local) {
  const all = doc.getElementsByTagName("*");
  const out = [];
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    if ((el.localName || el.nodeName.split(":").pop()) === local) out.push(el);
  }
  return out;
}

/** RTZ: <waypoints><waypoint id name><position lat lon/><leg geometryType="Loxodrome|Orthodrome"/>... */
export function parseRtz(text, parser) {
  const doc = parseXml(text, parser);
  const routeInfo = byTag(doc, "routeInfo")[0];
  const name = routeInfo?.getAttribute("routeName") || routeInfo?.getAttribute("name") || "";
  const waypoints = [];
  for (const wp of byTag(doc, "waypoint")) {
    const pos = byTag(wp, "position")[0];
    const lat = num(pos?.getAttribute("lat")), lon = num(pos?.getAttribute("lon"));
    if (lat == null || lon == null) continue;
    const leg = byTag(wp, "leg")[0];
    const geom = (leg?.getAttribute("geometryType") || "").toLowerCase();
    waypoints.push({ lat, lon, name: wp.getAttribute("name") || null, legType: geom.startsWith("orth") ? "GC" : geom ? "RL" : null });
  }
  return { name, waypoints, format: "rtz" };
}

/** GPX: route points (rtept) first, else track points (trkpt), else waypoints (wpt). */
export function parseGpx(text, parser) {
  const doc = parseXml(text, parser);
  const pick = ["rtept", "trkpt", "wpt"].map((t) => byTag(doc, t)).find((l) => l.length) || [];
  const nameEl = byTag(doc, "name")[0];
  const waypoints = [];
  for (const pt of pick) {
    const lat = num(pt.getAttribute("lat")), lon = num(pt.getAttribute("lon"));
    if (lat == null || lon == null) continue;
    const n = byTag(pt, "name")[0];
    waypoints.push({ lat, lon, name: n?.textContent?.trim() || null, legType: null });
  }
  return { name: nameEl?.textContent?.trim() || "", waypoints, format: "gpx" };
}

/** KML: the first LineString's coordinates, else every Placemark Point. Coordinates are lon,lat[,alt]. */
export function parseKml(text, parser) {
  const doc = parseXml(text, parser);
  const line = byTag(doc, "LineString")[0];
  const nameEl = byTag(doc, "name")[0];
  const waypoints = [];
  if (line) {
    const coords = byTag(line, "coordinates")[0]?.textContent || "";
    for (const tok of coords.trim().split(/\s+/)) {
      const [lon, lat] = tok.split(",").map(num);
      if (lat != null && lon != null) waypoints.push({ lat, lon, name: null, legType: null });
    }
  } else {
    for (const pm of byTag(doc, "Placemark")) {
      const coords = byTag(byTag(pm, "Point")[0] || pm, "coordinates")[0]?.textContent || "";
      const [lon, lat] = coords.trim().split(",").map(num);
      if (lat != null && lon != null) waypoints.push({ lat, lon, name: byTag(pm, "name")[0]?.textContent?.trim() || null, legType: null });
    }
  }
  return { name: nameEl?.textContent?.trim() || "", waypoints, format: "kml" };
}

const DM = /(\d{1,3})[-°\s]+(\d{1,2}(?:[.,]\d+)?)['′]?\s*([NSEW])/gi;

/** CSV, TXT and NMEA lists: one waypoint per line as decimal pairs or degrees-minutes with N/S/E/W. */
export function parseRouteText(text) {
  const waypoints = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^(#|name|wp|lat)/i.test(line)) continue;
    if (line.startsWith("$")) {
      const f = line.split(",");
      const kind = f[0].slice(3);
      if (kind === "WPL" && f.length >= 5) {
        const lat = nmea(f[1], f[2]), lon = nmea(f[3], f[4]);
        if (lat != null && lon != null) waypoints.push({ lat, lon, name: (f[5] || "").split("*")[0] || null, legType: null });
      }
      continue;
    }
    const dm = [...line.matchAll(DM)];
    if (dm.length >= 2) {
      const val = (m) => {
        const v = Number(m[1]) + Number(m[2].replace(",", ".")) / 60;
        return /[SW]/i.test(m[3]) ? -v : v;
      };
      const a = val(dm[0]), b = val(dm[1]);
      const latFirst = /[NS]/i.test(dm[0][3]);
      waypoints.push({ lat: latFirst ? a : b, lon: latFirst ? b : a, name: line.replace(DM, "").replace(/[;,|\t]+/g, " ").trim() || null, legType: null });
      continue;
    }
    const nums = line.split(/[;,|\t ]+/).map(num).filter((n) => n != null);
    if (nums.length >= 2 && Math.abs(nums[0]) <= 90 && Math.abs(nums[1]) <= 180) {
      waypoints.push({ lat: nums[0], lon: nums[1], name: null, legType: null });
    }
  }
  return { name: "", waypoints, format: "text" };
}

function nmea(value, hemi) {
  const v = Number(value);
  if (!Number.isFinite(v)) return null;
  const d = Math.floor(v / 100), m = v - d * 100;
  const out = d + m / 60;
  return /[SW]/i.test(hemi) ? -out : out;
}

/** Pick the parser from the file name or the content. */
export function parseRoute(fileName, text, parser) {
  const ext = String(fileName || "").toLowerCase().split(".").pop();
  const head = String(text).slice(0, 400).toLowerCase();
  if (ext === "rtz" || head.includes("<route")) return parseRtz(text, parser);
  if (ext === "gpx" || head.includes("<gpx")) return parseGpx(text, parser);
  if (ext === "kml" || head.includes("<kml")) return parseKml(text, parser);
  return parseRouteText(text);
}

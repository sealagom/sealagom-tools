/**
 * SeaLagom tools: route converter. Any route file in (see route-files.mjs), RTZ, GPX, KML, CSV or
 * NMEA 0183 out. Browser, Node, Deno, Bun; no dependencies.
 *
 *   import { convertRoute, writeRtz, writeGpx, writeKml, writeCsv, writeNmea } from "./route-convert.mjs";
 *   const text = convertRoute("passage.gpx", gpxText, "rtz");       // the RTZ file as a string
 *
 * Command line: node js/route-convert.mjs passage.gpx passage.rtz
 */
import { parseRoute } from "./route-files.mjs";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const f6 = (n) => Number(n).toFixed(6);
const wpName = (wp, i) => wp.name || `WP${i + 1}`;

/** RTZ 1.1 (IEC 61174): the format ECDIS import and export. */
export function writeRtz(waypoints, name = "Route") {
  const out = ['<?xml version="1.0" encoding="UTF-8"?>', '<route xmlns="http://www.cirm.org/RTZ/1/1" version="1.1">',
    `  <routeInfo routeName="${esc(name)}" />`, "  <waypoints>", '    <defaultWaypoint radius="0.5" />'];
  waypoints.forEach((wp, i) => {
    out.push(`    <waypoint id="${i + 1}" name="${esc(wpName(wp, i))}">`);
    out.push(`      <position lat="${f6(wp.lat)}" lon="${f6(wp.lon)}" />`);
    if (i) out.push(`      <leg geometryType="${wp.legType === "GC" ? "Orthodrome" : "Loxodrome"}" />`);
    out.push("    </waypoint>");
  });
  out.push("  </waypoints>", "</route>", "");
  return out.join("\n");
}

export function writeGpx(waypoints, name = "Route") {
  const out = ['<?xml version="1.0" encoding="UTF-8"?>', '<gpx version="1.1" creator="SeaLagom" xmlns="http://www.topografix.com/GPX/1/1">', "  <rte>", `    <name>${esc(name)}</name>`];
  waypoints.forEach((wp, i) => out.push(`    <rtept lat="${f6(wp.lat)}" lon="${f6(wp.lon)}"><name>${esc(wpName(wp, i))}</name></rtept>`));
  out.push("  </rte>", "</gpx>", "");
  return out.join("\n");
}

export function writeKml(waypoints, name = "Route") {
  const coords = waypoints.map((wp) => `${f6(wp.lon)},${f6(wp.lat)},0`).join(" ");
  const out = ['<?xml version="1.0" encoding="UTF-8"?>', '<kml xmlns="http://www.opengis.net/kml/2.2">', "  <Document>", `    <name>${esc(name)}</name>`,
    '    <Style id="route"><LineStyle><color>ff2f7f5f</color><width>3</width></LineStyle></Style>',
    `    <Placemark><name>${esc(name)}</name><styleUrl>#route</styleUrl><LineString><tessellate>1</tessellate><coordinates>${coords}</coordinates></LineString></Placemark>`];
  waypoints.forEach((wp, i) => out.push(`    <Placemark><name>${esc(wpName(wp, i))}</name><Point><coordinates>${f6(wp.lon)},${f6(wp.lat)},0</coordinates></Point></Placemark>`));
  out.push("  </Document>", "</kml>", "");
  return out.join("\n");
}

export function writeCsv(waypoints) {
  const q = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return ["name,lat,lon", ...waypoints.map((wp, i) => `${q(wpName(wp, i))},${f6(wp.lat)},${f6(wp.lon)}`)].join("\n") + "\n";
}

function nmeaSentence(body) {
  let cs = 0;
  for (const ch of body) cs ^= ch.charCodeAt(0);
  return `$${body}*${cs.toString(16).toUpperCase().padStart(2, "0")}`;
}
function dm(v, pos, neg, width) {
  const h = v >= 0 ? pos : neg;
  const a = Math.abs(v), d = Math.floor(a), m = (a - d) * 60;
  return [`${String(d).padStart(width, "0")}${m.toFixed(3).padStart(6, "0")}`, h];
}

/** NMEA 0183: one WPL sentence per waypoint and RTE sentences (eight names each). */
export function writeNmea(waypoints, name = "ROUTE") {
  const lines = [], names = [];
  waypoints.forEach((wp, i) => {
    const [la, lh] = dm(wp.lat, "N", "S", 2), [lo, loh] = dm(wp.lon, "E", "W", 3);
    const n = wpName(wp, i).replace(/,/g, " ").slice(0, 10);
    names.push(n);
    lines.push(nmeaSentence(`GPWPL,${la},${lh},${lo},${loh},${n}`));
  });
  const chunks = [];
  for (let i = 0; i < names.length; i += 8) chunks.push(names.slice(i, i + 8));
  if (!chunks.length) chunks.push([]);
  chunks.forEach((c, k) => lines.push(nmeaSentence(`GPRTE,${chunks.length},${k + 1},c,${String(name).slice(0, 10).replace(/,/g, " ")},${c.join(",")}`)));
  return lines.join("\r\n") + "\r\n";
}

export const WRITERS = { rtz: writeRtz, gpx: writeGpx, kml: writeKml, csv: writeCsv, nmea: writeNmea };

/** Parse any route text and write it in another format. */
export function convertRoute(fileName, text, to, parser) {
  const fmt = String(to).toLowerCase();
  if (!WRITERS[fmt]) throw new Error(`to must be one of ${Object.keys(WRITERS).join(", ")}`);
  const route = parseRoute(fileName, text, parser);
  if (route.waypoints.length < 2) throw new Error("A route needs at least two waypoints.");
  return WRITERS[fmt](route.waypoints, route.name || String(fileName).replace(/\.[^.]+$/, ""));
}

// Command line: node js/route-convert.mjs in.gpx out.rtz
if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("route-convert.mjs")) {
  const [, , input, output] = process.argv;
  if (!input || !output) {
    console.error("usage: node route-convert.mjs <in.rtz|gpx|kml|csv|txt> <out.rtz|gpx|kml|csv|nmea>");
    process.exit(2);
  }
  const fs = await import("node:fs");
  const text = fs.readFileSync(input, "utf8");
  const to = output.split(".").pop();
  fs.writeFileSync(output, convertRoute(input, text, to));
  console.log(`${input} -> ${output}`);
}

import test from "node:test";
import assert from "node:assert/strict";
import {
  parseCommand, parseNumbers, parseWaypoints,
  formatWarnings, formatPort, formatVessel, formatStations, formatWeather, formatRoute, formatError,
} from "../telegram/format.mjs";

test("parseCommand", () => {
  assert.deepEqual(parseCommand("/near 36.1 -5.4 30"), { cmd: "near", args: "36.1 -5.4 30" });
  assert.deepEqual(parseCommand("/help@my_bot"), { cmd: "help", args: "" });
  assert.equal(parseCommand("hello"), null);
  assert.equal(parseCommand(""), null);
});

test("parseNumbers", () => {
  assert.deepEqual(parseNumbers("36.1 -5.4 30", 2, ["lat", "lon"]), [36.1, -5.4, 30]);
  assert.throws(() => parseNumbers("36.1", 2, ["lat", "lon"]), /lon is missing/);
  assert.throws(() => parseNumbers("", 2, ["lat", "lon"]), /lat/);
});

test("parseWaypoints", () => {
  assert.deepEqual(parseWaypoints("51.0,1.5;36.1,-5.4"), [[51.0, 1.5], [36.1, -5.4]]);
  assert.throws(() => parseWaypoints("51.0,1.5"), /two points/);
  assert.throws(() => parseWaypoints("51.0,x;36.1,-5.4"), /Not a position/);
});

test("formatWarnings", () => {
  assert.equal(formatWarnings([]), "Nothing in force there.");
  const text = formatWarnings([{ navarea: "NAVAREA XI", number: "100/26", title: "Rocket launch area", severity: "critical" }]);
  assert.match(text, /NAVAREA XI 100\/26: Rocket launch area/);
  assert.match(text, /\u{1f534}/u);
  const many = Array.from({ length: 10 }, (_, i) => ({ number: `${i}/26`, title: "x" }));
  assert.match(formatWarnings(many, { limit: 8 }), /and 2 more/);
});

test("formatPort / formatVessel / formatStations / formatWeather / formatRoute", () => {
  assert.equal(formatPort(null), "No port by that name.");
  assert.match(formatPort({ name: "Singapore", country_code: "SG", max_draft_m: 21 }), /Singapore \(SG\)/);
  assert.equal(formatVessel({}), "No vessel or warning naming it found.");
  assert.match(formatVessel({ rows: [{ name: "AL DASMA", mmsi: 471000000 }] }), /AL DASMA MMSI 471000000/);
  assert.equal(formatStations({}), "No rescue centre or DSC station listed that near.");
  assert.match(formatStations({ results: [{ name: "MRCC Gibraltar", distance_nm: 12.4 }] }), /MRCC Gibraltar \(12 NM\)/);
  assert.equal(formatWeather({}), "No forecast for that position and time.");
  assert.match(formatWeather({ at: { wind_speed_kn: 18.4, wind_dir_deg: 270 } }), /Wind 18 kn from 270/);
  assert.match(formatRoute({ route_nm: 943, navareas: [{ name: "NAVAREA III" }], count: 2, corridor_nm: 10 }), /943 NM through NAVAREA III\. 2 warning\(s\)/);
});

test("formatError", () => {
  assert.match(formatError({ upgrade: true, message: "Full API only" }), /needs a plan/);
  assert.equal(formatError({ status: 404, message: "x" }), "Nothing found.");
  assert.match(formatError(new Error("network down")), /network down/);
});

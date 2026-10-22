import test from "node:test";
import assert from "node:assert/strict";
import { greatCircle, rhumbLine, rhumbDestination, routeLength, eta, speedForEta, trueWind, apparentWind, beaufort, zoneFromLongitude, formatPosition, parsePosition } from "../js/navigation.mjs";
import { parseRoute } from "../js/route-files.mjs";

test("distances and courses", () => {
  const gc = greatCircle({ lat: 0, lon: 0 }, { lat: 0, lon: 1 });
  assert.ok(Math.abs(gc.distance - 60) < 0.2 && Math.abs(gc.course - 90) < 1e-6);
  const rl = rhumbLine({ lat: 51.0, lon: 1.5 }, { lat: 36.1, lon: -5.4 });
  assert.ok(rl.distance > 950 && rl.distance < 1000 && rl.course > 190 && rl.course < 200, JSON.stringify(rl));
  const back = rhumbDestination({ lat: 51.0, lon: 1.5 }, rl.course, rl.distance);
  assert.ok(Math.abs(back.lat - 36.1) < 0.01 && Math.abs(back.lon + 5.4) < 0.01, JSON.stringify(back));
  assert.ok(Math.abs(routeLength([{ lat: 0, lon: 0 }, { lat: 0, lon: 1 }, { lat: 1, lon: 1 }]) - 120) < 0.3);
  const dl = rhumbLine({ lat: 0, lon: 179.5 }, { lat: 0, lon: -179.5 });
  assert.ok(dl.distance < 61 && Math.abs(dl.course - 90) < 1e-6, "the short way across the date line");
});

test("eta and speed", () => {
  const { eta: at, hours } = eta("2026-10-22T00:00:00Z", 240, 12);
  assert.equal(hours, 20);
  assert.equal(at.toISOString(), "2026-10-22T20:00:00.000Z");
  assert.ok(Math.abs(speedForEta("2026-10-22T00:00:00Z", "2026-10-23T00:00:00Z", 300).speed - 12.5) < 1e-9);
  assert.throws(() => eta(new Date(), 10, 0));
});

test("wind", () => {
  const w = trueWind(90, 10, 45, 20);
  const back = apparentWind(90, 10, w.twd, w.tws);
  assert.ok(Math.abs(back.aws - 20) < 1e-9 && Math.abs(back.awa - 45) < 1e-9, JSON.stringify({ w, back }));
  const head = trueWind(0, 10, 0, 25); // wind right ahead at 25 kn apparent, 10 kn through the water: 15 kn true from ahead
  assert.ok(Math.abs(head.tws - 15) < 1e-9 && Math.abs(head.twd) < 1e-9, JSON.stringify(head));
  assert.equal(beaufort(0), 0); assert.equal(beaufort(33), 8); assert.equal(beaufort(70), 12);
});

test("zones and positions", () => {
  assert.deepEqual(zoneFromLongitude(30.5), { offset: 2, letter: "B" });
  assert.deepEqual(zoneFromLongitude(-73), { offset: -5, letter: "R" });
  assert.equal(formatPosition({ lat: 36.14, lon: -5.353 }), "36-08.40N 005-21.18W");
  assert.deepEqual(parsePosition("36-08.4N 005-21.2W"), { lat: 36 + 8.4 / 60, lon: -(5 + 21.2 / 60) });
  assert.deepEqual(parsePosition("36.14 -5.35"), { lat: 36.14, lon: -5.35 });
  assert.ok(Math.abs(parsePosition("3608.4N 00521.2W").lon + (5 + 21.2 / 60)) < 1e-9);
});

test("route files", () => {
  const gpx = parseRoute("p.gpx", '<gpx><rte><name>Dover</name><rtept lat="51.0" lon="1.5"><name>A</name></rtept><rtept lat="36.1" lon="-5.4"/></rte></gpx>');
  assert.equal(gpx.format, "gpx"); assert.equal(gpx.name, "Dover"); assert.equal(gpx.waypoints.length, 2); assert.equal(gpx.waypoints[0].name, "A");
  const rtz = parseRoute("p.rtz", '<route xmlns="http://www.cirm.org/RTZ/1/1"><routeInfo routeName="Test"/><waypoints><waypoint id="1" name="WP1"><position lat="51" lon="1.5"/><leg geometryType="Orthodrome"/></waypoint><waypoint id="2"><position lat="36.1" lon="-5.4"/></waypoint></waypoints></route>');
  assert.equal(rtz.format, "rtz"); assert.equal(rtz.name, "Test"); assert.equal(rtz.waypoints[0].legType, "GC");
  const kml = parseRoute("p.kml", '<kml><Document><name>K</name><Placemark><LineString><coordinates>1.5,51.0,0 -5.4,36.1,0</coordinates></LineString></Placemark></Document></kml>');
  assert.equal(kml.waypoints[1].lat, 36.1);
  const txt = parseRoute("p.txt", "WP1 51-00.0N 001-30.0E\nWP2 36-06.0N 005-24.0W\n$GPWPL,3608.40,N,00521.20,W,WP3*00\n36.14, -5.35");
  assert.equal(txt.waypoints.length, 4);
  assert.ok(Math.abs(txt.waypoints[1].lon + 5.4) < 1e-9);
});

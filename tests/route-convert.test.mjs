import test from "node:test";
import assert from "node:assert/strict";
import { convertRoute, writeRtz, writeGpx, writeKml, writeCsv, writeNmea } from "../js/route-convert.mjs";
import { parseRoute } from "../js/route-files.mjs";

const WPS = [{ lat: 51.0, lon: 1.5, name: "Dover" }, { lat: 36.1, lon: -5.4, name: "Gib" }];
const GPX = `<?xml version="1.0"?><gpx version="1.1" creator="t" xmlns="http://www.topografix.com/GPX/1/1">
<rte><name>Dover Gib</name><rtept lat="51.0" lon="1.5"><name>Dover</name></rtept><rtept lat="36.1" lon="-5.4"><name>Gib</name></rtept></rte></gpx>`;

test("writers", () => {
  const rtz = writeRtz(WPS, "Dover Gib");
  assert.ok(rtz.includes('<routeInfo routeName="Dover Gib" />') && rtz.includes('<position lat="36.100000" lon="-5.400000" />'));
  assert.ok(rtz.includes('<leg geometryType="Loxodrome" />'));
  assert.ok(writeGpx(WPS, "x").includes('<rtept lat="51.000000" lon="1.500000"><name>Dover</name></rtept>'));
  assert.ok(writeKml(WPS, "x").includes("1.500000,51.000000,0 -5.400000,36.100000,0"));
  assert.equal(writeCsv(WPS).split("\n")[1], "Dover,51.000000,1.500000");
  const nmea = writeNmea(WPS, "DOVER GIB");
  assert.ok(nmea.includes("$GPWPL,5100.000,N,00130.000,E,Dover*") && nmea.includes("$GPRTE,1,1,c,DOVER GIB,Dover,Gib*"), nmea);
  const [body, cs] = nmea.split("\r\n")[0].slice(1).split("*");
  let x = 0;
  for (const ch of body) x ^= ch.charCodeAt(0);
  assert.equal(x.toString(16).toUpperCase().padStart(2, "0"), cs);
});

test("round trips", () => {
  for (const to of ["rtz", "gpx", "kml", "csv"]) {
    const out = convertRoute("passage.gpx", GPX, to);
    const back = parseRoute(`passage.${to}`, out);
    assert.equal(back.waypoints.length, 2, to);
    assert.ok(Math.abs(back.waypoints[1].lat - 36.1) < 1e-6 && Math.abs(back.waypoints[1].lon + 5.4) < 1e-6, to);
  }
  assert.ok(convertRoute("passage.gpx", GPX, "nmea").startsWith("$GPWPL"));
  assert.throws(() => convertRoute("x.gpx", GPX, "docx"), /to must be one of/);
  assert.throws(() => convertRoute("x.csv", "name,lat,lon\nA,1,2\n", "gpx"), /two waypoints/);
});

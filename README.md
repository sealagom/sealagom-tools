<img src="https://raw.githubusercontent.com/tttt-netizen/sealagom-api/main/brand/mark.svg" width="72" alt="">

# SeaLagom tools

Free, MIT, no dependencies: the arithmetic a navigator uses every day, in JavaScript and Python,
plus thin helpers for the SeaLagom API (ports, distances, route analysis, weather).

| | JavaScript | Python |
|---|---|---|
| Distances and courses: great circle, rhumb line, destination, route length and legs | `js/navigation.mjs` | `python/sealagom_tools.py` |
| ETA, the speed for an ETA, distance run and speed made good | same | same |
| True wind from apparent and back, Beaufort | same | same |
| Nautical time zone from longitude, positions as DD-MM.MMN and back | same | same |
| Route files: RTZ, GPX, KML, CSV and TXT lists, NMEA WPL | `js/route-files.mjs` | use the API: `POST /api/v2/route/` reads them all |
| Route converter: any of those in, RTZ, GPX, KML, CSV or NMEA out | `js/route-convert.mjs` | `POST /api/v2/route/convert/?to=rtz` |
| Ports, port distances, coast stations, vessels by name or MMSI, warnings near, weather, route analysis with weather | `js/api.mjs` | `python/sealagom.py` in the API kit |

```js
import { rhumbLine, eta, trueWind, beaufort } from "./js/navigation.mjs";
import { parseRoute } from "./js/route-files.mjs";
import { analyseRoute, searchPorts } from "./js/api.mjs";

const leg = rhumbLine({ lat: 51.0, lon: 1.5 }, { lat: 36.1, lon: -5.4 });     // { distance: 942.9, course: 198.4 }
const { eta: arrival } = eta("2026-10-22T06:00:00Z", leg.distance, 14);
const wind = trueWind(195, 14, 40, 22);                                          // { tws, twd, twa }
console.log(leg, arrival.toISOString(), wind, "Bf", beaufort(wind.tws));

const route = parseRoute("passage.rtz", await (await fetch("passage.rtz")).text());
const check = await analyseRoute(route.waypoints, { speedKn: 14, corridorNm: 15, weather: true, key: "YOUR_KEY" });
console.log(check.route_nm, check.navareas.map((z) => z.name), check.count, check.weather);

const ports = await searchPorts("Singapore");
```

```python
from sealagom_tools import rhumb_line, eta, true_wind, beaufort
d, c = rhumb_line((51.0, 1.5), (36.1, -5.4))
arrival, hours = eta("2026-10-22T06:00:00Z", d, 14)
print(d, c, arrival, true_wind(195, 14, 40, 22), beaufort(22))
```

Route converter, no API needed:

```bash
node js/route-convert.mjs passage.gpx passage.rtz      # also .kml .csv .nmea .gpx
```

```js
import { convertRoute } from "./js/route-convert.mjs";
const rtz = convertRoute("passage.gpx", gpxText, "rtz");   // the RTZ 1.1 file as a string, ready for the ECDIS
```

The same converter runs on the server for every API key: `POST /api/v2/route/convert/?to=rtz` with the
file as `file` (or JSON waypoints), and the converted file comes back as a download.

Tests: `npm test` (navigation and converter) and `python python/sealagom_tools.py`.

## Formulas

Great circle: haversine on a sphere of 3440.065 NM radius. Rhumb line: Mercator projection,
the short way across the date line. ETA: distance divided by speed from the departure time. True
wind: the apparent wind vector minus the ship's own motion (heading and speed through the water);
angles relative to the heading, starboard positive. Beaufort: the knot thresholds of the scale.
Time zones: the nautical zone of the longitude, letters A to M east (no J) and N to Y west.

## The API

The helpers in `js/api.mjs` call https://www.sealagom.com with a key (free keys carry the Developer
allowance; the same key for ports, stations, vessels, weather and the route analysis) (https://www.sealagom.com/profile/?tab=api, or sign in
with GitHub). When a plan does not cover a call, the error carries `upgrade`: the plan, the price
for that request and the links. The full API kit (OpenAPI spec, clients, MCP server) is at
https://www.sealagom.com/github/.

## Rules of the data

The warnings are the authority; the analysis is machine-made and can be wrong. Credit SeaLagom,
www.sealagom.com, where the data is shown. The arithmetic here is an aid, never a substitute for
the ship's own navigation.

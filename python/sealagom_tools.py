"""SeaLagom tools: navigation arithmetic in Python 3.9+, no dependencies.

    from sealagom_tools import great_circle, rhumb_line, eta, speed_for_eta, true_wind, apparent_wind, beaufort, route_length

Positions are (lat, lon) tuples in decimal degrees (north and east positive). Distances in nautical
miles, courses in degrees true (0..360), speeds in knots, times as datetime (UTC) or ISO strings.
"""

from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone

R_NM = 3440.065


def norm360(d: float) -> float:
    return d % 360.0


def signed(a: float) -> float:
    x = norm360(a)
    return x - 360.0 if x > 180.0 else x


def great_circle(a, b) -> tuple[float, float]:
    """(distance NM, initial course °T) from a to b."""
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dl = math.radians(b[1] - a[1])
    s = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    distance = 2 * R_NM * math.asin(min(1.0, math.sqrt(s)))
    y = math.sin(dl) * math.cos(p2)
    x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return distance, norm360(math.degrees(math.atan2(y, x)))


def rhumb_line(a, b) -> tuple[float, float]:
    """(distance NM, constant course °T) from a to b, the short way round the date line."""
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dl = math.radians(b[1] - a[1])
    if abs(dl) > math.pi:
        dl = dl - 2 * math.pi if dl > 0 else dl + 2 * math.pi
    dpsi = math.log(math.tan(math.pi / 4 + p2 / 2) / math.tan(math.pi / 4 + p1 / 2))
    q = (p2 - p1) / dpsi if abs(dpsi) > 1e-12 else math.cos(p1)
    distance = math.sqrt((p2 - p1) ** 2 + q * q * dl * dl) * R_NM
    return distance, norm360(math.degrees(math.atan2(dl, dpsi)))


def rhumb_destination(a, course: float, distance: float) -> tuple[float, float]:
    d, th = distance / R_NM, math.radians(course)
    p1, l1 = math.radians(a[0]), math.radians(a[1])
    dp = d * math.cos(th)
    p2 = p1 + dp
    if abs(p2) > math.pi / 2:
        p2 = math.pi - p2 if p2 > 0 else -math.pi - p2
    dpsi = math.log(math.tan(p2 / 2 + math.pi / 4) / math.tan(p1 / 2 + math.pi / 4))
    q = dp / dpsi if abs(dpsi) > 1e-12 else math.cos(p1)
    l2 = l1 + d * math.sin(th) / q
    return math.degrees(p2), (math.degrees(l2) + 540) % 360 - 180


def route_length(points, leg_types=None) -> float:
    """Length (NM) of a route as its legs are sailed: "RL" (default) or "GC" per leg."""
    nm = 0.0
    for i in range(len(points) - 1):
        gc = bool(leg_types) and i < len(leg_types) and leg_types[i] == "GC"
        nm += (great_circle if gc else rhumb_line)(points[i], points[i + 1])[0]
    return nm


def route_legs(points, leg_types=None) -> list[dict]:
    legs, along = [], 0.0
    for i in range(len(points) - 1):
        gc = bool(leg_types) and i < len(leg_types) and leg_types[i] == "GC"
        distance, course = (great_circle if gc else rhumb_line)(points[i], points[i + 1])
        along += distance
        legs.append({"from": i, "to": i + 1, "type": "GC" if gc else "RL", "distance": distance, "course": course, "along": along})
    return legs


def _dt(value) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


def eta(departure, distance_nm: float, speed_kn: float) -> tuple[datetime, float]:
    """(arrival, hours) for a distance at a speed from a departure."""
    if speed_kn <= 0:
        raise ValueError("speed must be above 0 kn")
    hours = distance_nm / speed_kn
    return _dt(departure) + timedelta(hours=hours), hours


def speed_for_eta(departure, arrival, distance_nm: float) -> tuple[float, float]:
    """(speed kn, hours) to cover a distance between a departure and a wanted arrival."""
    hours = (_dt(arrival) - _dt(departure)).total_seconds() / 3600.0
    if hours <= 0:
        raise ValueError("arrival must be after departure")
    return distance_nm / hours, hours


def distance_run(a, time_a, b, time_b) -> dict:
    distance, course = rhumb_line(a, b)
    hours = (_dt(time_b) - _dt(time_a)).total_seconds() / 3600.0
    return {"distance": distance, "course": course, "hours": hours, "speed_made_good": distance / hours if hours > 0 else None}


def true_wind(heading: float, sog: float, awa: float, aws: float) -> dict:
    """True wind from apparent: heading °T, ship speed kn, apparent wind angle (° relative, starboard
    positive) and speed kn -> {tws, twd (from, °T), twa (relative)}."""
    a_dir = math.radians(norm360(heading + awa))
    x = aws * math.sin(a_dir) - sog * math.sin(math.radians(heading))
    y = aws * math.cos(a_dir) - sog * math.cos(math.radians(heading))
    tws = math.hypot(x, y)
    twd = norm360(math.degrees(math.atan2(x, y)))
    return {"tws": tws, "twd": twd, "twa": signed(twd - heading)}


def apparent_wind(heading: float, sog: float, twd: float, tws: float) -> dict:
    x = tws * math.sin(math.radians(twd)) + sog * math.sin(math.radians(heading))
    y = tws * math.cos(math.radians(twd)) + sog * math.cos(math.radians(heading))
    aws = math.hypot(x, y)
    awd = norm360(math.degrees(math.atan2(x, y)))
    return {"aws": aws, "awd": awd, "awa": signed(awd - heading)}


_BEAUFORT = (1, 3, 6, 10, 16, 21, 27, 33, 40, 47, 55, 63)


def beaufort(knots: float) -> int:
    f = 0
    while f < 12 and knots >= _BEAUFORT[f]:
        f += 1
    return f


def zone_from_longitude(lon: float) -> tuple[int, str]:
    """Nautical time zone: (offset hours east positive, zone letter)."""
    offset = int(round(lon / 15.0))
    if offset == 0:
        return 0, "Z"
    letters = "ABCDEFGHIKLM" if offset > 0 else "NOPQRSTUVWXY"
    i = abs(offset) - 1
    return offset, letters[i] if i < len(letters) else "?"


def format_position(lat: float, lon: float, decimals: int = 2) -> str:
    def dm(v, pos, neg, width):
        h = pos if v >= 0 else neg
        a = abs(v)
        d = int(a)
        return f"{d:0{width}d}-{(a - d) * 60:0{3 + decimals}.{decimals}f}{h}"

    return f"{dm(lat, 'N', 'S', 2)} {dm(lon, 'E', 'W', 3)}"


if __name__ == "__main__":  # a few checks: python sealagom_tools.py
    d, c = rhumb_line((51.0, 1.5), (36.1, -5.4))
    assert 930 < d < 960 and 190 < c < 205, (d, c)  # Dover to Gibraltar, about 943 NM
    g, _ = great_circle((0, 0), (0, 1))
    assert abs(g - 60.0) < 0.2, g
    w = true_wind(90, 10, 45, 20)
    back = apparent_wind(90, 10, w["twd"], w["tws"])
    assert abs(back["aws"] - 20) < 1e-9 and abs(signed(back["awa"] - 45)) < 1e-9, (w, back)
    assert beaufort(0) == 0 and beaufort(33) == 8 and beaufort(70) == 12
    assert zone_from_longitude(-5.4) == (0, "Z") and zone_from_longitude(30.5) == (2, "B") and zone_from_longitude(-73) == (-5, "R")
    assert format_position(36.14, -5.353) == "36-08.40N 005-21.18W"
    print("ok")

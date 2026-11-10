#!/usr/bin/env python3
"""KiCad 10 read-only native cached fill evidence (not DRC or connectivity)."""
import json
import re
import sys
import xml.etree.ElementTree as ET
import pcbnew

BOUNDS = (125., 215., 195., 290.)

def overlaps(polys):
    if polys.OutlineCount() != 1:
        return None
    line = polys.COutline(0)
    if line.ArcCount() or line.PointCount() < 3:
        return None
    points = [(line.CPoint(i).x / 1e6, line.CPoint(i).y / 1e6)
              for i in range(line.PointCount())]
    lo_x, hi_x, lo_y, hi_y = BOUNDS
    def inside(v):
        return lo_x <= v[0] <= hi_x and lo_y <= v[1] <= hi_y
    for a, b in zip(points, points[1:] + points[:1]):
        if inside(a) or inside(b):
            return True
        x1, y1 = a; x2, y2 = b
        dx = x2 - x1; dy = y2 - y1
        for x in (lo_x, hi_x):
            if dx and 0 <= (x - x1) / dx <= 1:
                if lo_y <= y1 + (x - x1) * dy / dx <= hi_y:
                    return True
        for y in (lo_y, hi_y):
            if dy and 0 <= (y - y1) / dy <= 1:
                if lo_x <= x1 + (y - y1) * dx / dy <= hi_x:
                    return True
    x, y = lo_x, lo_y
    hit = False
    for i, (x2, y2) in enumerate(points):
        x1, y1 = points[i - 1]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            hit = not hit
    return hit

def verify_svg_contours(board, svg_path, lid):
    zones = [z for z in board.Zones() if z.GetLayerSet().Contains(lid)]
    filled_zones = [z for z in zones if z.GetFilledPolysList(lid).OutlineCount() > 0]
    tree = ET.parse(svg_path)
    root = tree.getroot()

    stroked_paths = []
    filled_pads = 0
    for g in root.findall('.//{http://www.w3.org/2000/svg}g'):
        style = g.attrib.get('style', '')
        if 'fill:none' in style and 'stroke:' in style:
            for p in g.findall('{http://www.w3.org/2000/svg}path'):
                d = p.attrib.get('d', '')
                pairs = re.findall(r'(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)', d)
                if len(pairs) >= 50:
                    stroked_paths.append([(round(float(x), 4), round(float(y), 4)) for x, y in pairs])
        elif 'fill:' in style and 'fill:none' not in style and 'stroke:none' in style:
            filled_pads += len(g.findall('{http://www.w3.org/2000/svg}path'))

    zone_results = []
    total_source_points = 0
    total_svg_points = 0
    total_source_unique = 0
    total_matched_unique = 0

    for z in filled_zones:
        poly = z.GetFilledPolysList(lid).COutline(0)
        source_pts = [(round(poly.CPoint(j).x / 1e6, 4), round(poly.CPoint(j).y / 1e6, 4)) for j in range(poly.PointCount())]
        source_unique = set(source_pts)
        total_source_points += len(source_pts)
        total_source_unique += len(source_unique)

        best_match = None
        best_count = 0
        for p_pts in stroked_paths:
            if len(p_pts) == len(source_pts):
                matching = len(source_unique & set(p_pts))
                if matching > best_count:
                    best_count = matching
                    best_match = p_pts
        if best_match is not None:
            total_svg_points += len(best_match)
            total_matched_unique += best_count
            zone_results.append({
                "net": z.GetNetname(),
                "source_points": len(source_pts),
                "svg_points": len(best_match),
                "matching_unique": best_count,
                "total_unique": len(source_unique)
            })

    return {
        "filled_zones_tested": len(filled_zones),
        "exact_path_matches": len(zone_results),
        "total_source_points": total_source_points,
        "total_svg_points": total_svg_points,
        "total_source_unique_vertices": total_source_unique,
        "total_matched_unique_vertices": total_matched_unique,
        "vertex_match_ratio": round(total_matched_unique / total_source_unique, 4) if total_source_unique else 0,
        "pads_distinguished_from_zones": filled_pads,
        "zone_evidence": zone_results
    }

def main(original, partial, svg_path=None):
    board = pcbnew.LoadBoard(original)
    reduced = pcbnew.LoadBoard(partial)
    if board.GetCopperLayerCount() != 12:
        raise ValueError("Expected genuine 12-layer reference board")
    if len(list(board.Zones())) != 128 or len(list(reduced.Zones())):
        raise ValueError("Original/partial zone count differs from accepted fixture")
    lid = board.GetLayerID("In2.Cu")
    zones = [z for z in board.Zones() if z.GetLayerSet().Contains(lid)]
    raw = [overlaps(z.Outline()) for z in zones]
    fills = [z.GetFilledPolysList(lid) for z in zones]
    filled = [overlaps(poly) for poly in fills]
    report = {
        "zone_sources": 128,
        "layer_zones": len(zones),
        "source_intersections": raw.count(True),
        "source_unknown": raw.count(None),
        "zones_with_cached_fill": sum(x.OutlineCount() > 0 for x in fills),
        "cached_fill_outline_intersections": filled.count(True),
        "partial_zones": len(list(reduced.Zones()))
    }
    expected = {
        "zone_sources": 128, "layer_zones": 8,
        "source_intersections": 6, "source_unknown": 0,
        "zones_with_cached_fill": 5, "cached_fill_outline_intersections": 4,
        "partial_zones": 0
    }
    if report != expected:
        raise ValueError("Native zone fixture changed: " + json.dumps(report))
    if svg_path:
        svg_parity = verify_svg_contours(board, svg_path, lid)
        if svg_parity["exact_path_matches"] != 5 or svg_parity["vertex_match_ratio"] < 0.998:
            raise ValueError("SVG zone contour parity check failed: " + json.dumps(svg_parity))
        report["svg_parity"] = svg_parity
    print(json.dumps(report, sort_keys=True))

if __name__ == "__main__":
    if len(sys.argv) not in (3, 4):
        raise SystemExit("Expected: verifyNativeZoneFillParity.py <original> <partial> [svg]")
    main(*sys.argv[1:])

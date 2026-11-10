#!/usr/bin/env python3
"""Read-only genuine KiCad routing parity. UUID fidelity, not electrical DRC."""
import json
import sys
import pcbnew

VIEWPORT = (125_000_000, 215_000_000, 195_000_000, 290_000_000)
KINDS = ('PCB_TRACK', 'PCB_VIA', 'PCB_ARC')

def facts(board):
    result = {}
    for item in board.GetTracks():
        uid = item.m_Uuid.AsString()
        kind = item.GetClass()
        if kind not in KINDS or uid in result:
            raise ValueError("Unknown/duplicate routing UUID")
        begin = item.GetStart()
        end = item.GetEnd()
        entry = {
            "class": kind,
            "start": [begin.x, begin.y],
            "end": [end.x, end.y],
            "net_name": item.GetNetname(),
            "net_code": item.GetNetCode(),
            "copper_layers": [i for i in range(32) if item.GetLayerSet().Contains(i)],
        }
        if kind == 'PCB_VIA':
            entry["via_span"] = [item.TopLayer(), item.BottomLayer()]
            entry["via_type"] = item.GetViaType()
        else:
            entry["width"] = item.GetWidth()
            if kind == 'PCB_ARC':
                mid = item.GetMid()
                entry["mid"] = [mid.x, mid.y]
        b = item.GetBoundingBox()
        entry["bbox"] = [b.GetLeft(), b.GetRight(), b.GetTop(), b.GetBottom()]
        result[uid] = entry
    return result

def overlaps(box):
    lo_x, hi_x, lo_y, hi_y = VIEWPORT
    return (box[0] <= hi_x and box[1] >= lo_x and
            box[2] <= hi_y and box[3] >= lo_y)

def direct_copper_truth(original_board, subset_board, subset_ids):
    """Compare KiCad's native direct track contacts, not inferred net-label links.

    Only retained track/arc/via objects are checked. Absence of zones and
    other source objects forbids any full-net or manufacturing conclusions.
    """
    original_items = {
        x.m_Uuid.AsString(): x for x in original_board.GetTracks()
    }
    subset_items = {
        x.m_Uuid.AsString(): x for x in subset_board.GetTracks()
    }
    original_connectivity = original_board.GetConnectivity()
    partial_connectivity = subset_board.GetConnectivity()
    common_edges = set()
    retained_partial_edges = set()
    missing_edges = set()
    extra_edges = set()
    same_net_not_direct = None
    examples_by_net = {}
    for uid, item in subset_items.items():
        if item.GetClass() != 'PCB_TRACK':
            continue
        full = original_items[uid]
        full_direct = {
            x.m_Uuid.AsString()
            for x in original_connectivity.GetConnectedTracks(full)
        } - {uid}
        subset_direct = {
            x.m_Uuid.AsString()
            for x in partial_connectivity.GetConnectedTracks(item)
        } - {uid}
        for peer in full_direct & subset_ids:
            common_edges.add(tuple(sorted((uid, peer))))
        for peer in subset_direct & subset_ids:
            retained_partial_edges.add(tuple(sorted((uid, peer))))
        for peer in full_direct - subset_ids:
            missing_edges.add((uid, peer))
        for peer in subset_direct - full_direct:
            extra_edges.add((uid, peer))
        if item.GetNetCode() > 0:
            previous = examples_by_net.get(item.GetNetCode())
            if previous is not None and previous not in full_direct:
                same_net_not_direct = (previous, uid)
            else:
                examples_by_net[item.GetNetCode()] = uid
    report = {
        "retained_direct_track_pairs_in_original": len(common_edges),
        "retained_direct_track_pairs_in_partial": len(retained_partial_edges),
        "retained_direct_pairs_missing_in_partial": len(
            common_edges - retained_partial_edges
        ),
        "original_direct_neighbors_missing_from_partial": len(missing_edges),
        "partial_contacts_not_in_original": len(extra_edges),
        "same_net_but_not_direct_track_contact_found": same_net_not_direct is not None
    }
    if len(common_edges) == 0 or len(missing_edges) == 0:
        raise ValueError("Fixture did not exercise both retained and missing native contacts")
    if extra_edges:
        raise ValueError("Subset fabricated KiCad direct track contacts")
    if same_net_not_direct is None:
        raise ValueError("Fixture lacks an identical-net but not directly touching pair")
    return report

def pad_and_via_contact_truth(original_board, subset_board):
    """Use KiCad native connectivity, never net-name or bbox inference.

    An edge is tested only if both endpoint UUIDs survive PARTIAL selection.
    Separately count direct source contacts that disappear with omitted items.
    """
    def pad_items(board):
        return {
            pad.m_Uuid.AsString(): pad
            for fp in board.GetFootprints()
            for pad in fp.Pads()
        }

    original_pads = pad_items(original_board)
    selected_pads = pad_items(subset_board)
    original_routes = {
        route.m_Uuid.AsString(): route for route in original_board.GetTracks()
    }
    selected_routes = {
        route.m_Uuid.AsString(): route for route in subset_board.GetTracks()
    }
    if len(original_pads) != 6883 or not selected_pads:
        raise ValueError("Expected original KiCad pads and retained partial pads")

    def pad_signature(pad):
        pos = pad.GetPosition()
        size = pad.GetSize()
        drill = pad.GetDrillSize()
        return (
            pos.x, pos.y, size.x, size.y, drill.x, drill.y,
            pad.GetShape(), pad.GetNetCode(), pad.GetNetname(),
            tuple(i for i in range(64) if pad.GetLayerSet().Contains(i)),
        )

    pad_mismatches = [
        uid for uid, pad in selected_pads.items()
        if uid not in original_pads
        or pad_signature(pad) != pad_signature(original_pads[uid])
    ]
    if pad_mismatches:
        raise ValueError("Original-to-PARTIAL pad identity/net/shape mismatch")

    full_conn = original_board.GetConnectivity()
    subset_conn = subset_board.GetConnectivity()
    source_kept_edges = {"route_pad": set(), "via_pad": set(), "via_route": set()}
    actual_kept_edges = {"route_pad": set(), "via_pad": set(), "via_route": set()}
    original_to_missing = {"route_pad": set(), "via_pad": set(), "via_route": set()}
    for uid, part_route in selected_routes.items():
        full_route = original_routes[uid]
        is_via = part_route.GetClass() == "PCB_VIA"
        category = "via_pad" if is_via else "route_pad"
        full_pad_uuids = {
            x.m_Uuid.AsString()
            for x in full_conn.GetConnectedPads(full_route)
        }
        part_pad_uuids = {
            x.m_Uuid.AsString()
            for x in subset_conn.GetConnectedPads(part_route)
        }
        for peer in full_pad_uuids & set(selected_pads):
            source_kept_edges[category].add((uid, peer))
        for peer in part_pad_uuids:
            actual_kept_edges[category].add((uid, peer))
        for peer in full_pad_uuids - set(selected_pads):
            original_to_missing[category].add((uid, peer))
        if is_via:
            full_route_peers = {
                x.m_Uuid.AsString()
                for x in full_conn.GetConnectedTracks(full_route)
            } - {uid}
            part_route_peers = {
                x.m_Uuid.AsString()
                for x in subset_conn.GetConnectedTracks(part_route)
            } - {uid}
            for peer in full_route_peers & set(selected_routes):
                source_kept_edges["via_route"].add((uid, peer))
            for peer in part_route_peers:
                actual_kept_edges["via_route"].add((uid, peer))
            for peer in full_route_peers - set(selected_routes):
                original_to_missing["via_route"].add((uid, peer))

    per_category = {}
    for category in source_kept_edges:
        original = source_kept_edges[category]
        actual = actual_kept_edges[category]
        per_category[category] = {
            "original_with_both_retained": len(original),
            "partial_direct_contacts": len(actual),
            "lost_when_both_retained": len(original - actual),
            "fabricated_in_partial": len(actual - original),
            "source_contacts_to_omitted_items": len(original_to_missing[category]),
        }
        if original - actual or actual - original:
            raise ValueError("Native retained contact differs: " + category)

    if (not per_category["route_pad"]["original_with_both_retained"]
            or not per_category["via_route"]["original_with_both_retained"]):
        raise ValueError("Fixture must contain real retained pad/route and via/route edges")
    return {
        "original_pads": len(original_pads),
        "partial_pads": len(selected_pads),
        "pad_geometry_net_mismatches": len(pad_mismatches),
        "contact_categories": per_category,
    }



def net_path_truth(original_board, partial_board):
    """Prove selected same-net pad paths can be lost in bounded sources.

    Uses only KiCad's actual GetConnectedTracks/GetConnectedPads graph.
    Zones, refill, electrical DRC and complete net connectivity are excluded.
    """
    import collections

    def net_items(board):
        routes = collections.defaultdict(dict)
        pads = collections.defaultdict(dict)
        for route in board.GetTracks():
            if route.GetNetCode() > 0:
                routes[route.GetNetCode()][route.m_Uuid.AsString()] = route
        for footprint in board.GetFootprints():
            for pad in footprint.Pads():
                if pad.GetNetCode() > 0:
                    pads[pad.GetNetCode()][pad.m_Uuid.AsString()] = pad
        return routes, pads

    original_routes, original_pads = net_items(original_board)
    partial_routes, partial_pads = net_items(partial_board)
    fully_retained_multi_pad_nets = [
        net
        for net, routes in partial_routes.items()
        if routes
        and len(partial_pads[net]) >= 2
        and len(routes) == len(original_routes[net])
        and len(partial_pads[net]) == len(original_pads[net])
    ]
    if fully_retained_multi_pad_nets:
        raise ValueError("Unexpected fully retained routed multi-pad net")

    def visited_graph(board, routes, pads, start_uid):
        import itertools
        items = {**routes, **pads}
        if start_uid not in items:
            raise ValueError("Missing source pad endpoint")
        queue = [start_uid]
        seen = set()
        conn = board.GetConnectivity()
        while queue:
            uid = queue.pop()
            if uid in seen:
                continue
            seen.add(uid)
            for linked in itertools.chain(
                conn.GetConnectedTracks(items[uid]),
                conn.GetConnectedPads(items[uid]),
            ):
                peer = linked.m_Uuid.AsString()
                if peer in items and peer not in seen:
                    queue.append(peer)
        return seen

    witnesses = []
    for net, expected_routes, expected_partial, pad_a, pad_b in (
        (334, 92, 3, ("IC13", "R8"), ("IC14", "AA23")),
        (335, 104, 14, ("IC13", "L3"), ("IC14", "Y23")),
        (331, 123, 31, ("IC13", "L7"), ("IC14", "W27")),
    ):
        full_routes = original_routes[net]
        selected_routes = partial_routes[net]
        full_pads = original_pads[net]
        selected_pads = partial_pads[net]
        if (len(full_routes), len(selected_routes), len(full_pads),
                len(selected_pads)) != (expected_routes, expected_partial, 4, 2):
            raise ValueError("Reference net population changed: " + str(net))
        identities = {
            (p.GetParentFootprint().GetReference(), p.GetNumber()): uid
            for uid, p in selected_pads.items()
        }
        if set(identities) != {pad_a, pad_b}:
            raise ValueError("Witness pads not present in partial: " + str(net))
        start = identities[pad_a]
        finish = identities[pad_b]
        complete_path = visited_graph(
            original_board, full_routes, full_pads, start
        )
        partial_path = visited_graph(
            partial_board, selected_routes, selected_pads, start
        )
        if finish not in complete_path or finish in partial_path:
            raise ValueError("Expected original path absent from partial: " + str(net))
        witnesses.append({
            "net_code": net,
            "net_name": full_pads[start].GetNetname(),
            "source_route_count": len(full_routes),
            "partial_route_count": len(selected_routes),
            "source_pads": len(full_pads),
            "partial_pads": len(selected_pads),
            "source_explicit_path": finish in complete_path,
            "partial_explicit_path": finish in partial_path,
            "source_reachable_component_objects": len(complete_path),
            "partial_reachable_component_objects": len(partial_path),
            "from": {"reference": pad_a[0], "pad": pad_a[1]},
            "to": {"reference": pad_b[0], "pad": pad_b[1]},
        })
    return {
        "fully_retained_multi_pad_routed_nets": len(
            fully_retained_multi_pad_nets
        ),
        "selected_witnesses": witnesses,
        "graph_basis": "native_direct_tracks_and_pads_only",
    }



def zone_fill_truth(original_board, subset_board):
    """Distinguish native source zone outlines from cached filled copper.

    Polygon bounding-box intersections are conservative candidates, not
    proof of filled copper contact or current/up-to-date copper planes.
    """
    layer = original_board.GetLayerID("In2.Cu")
    x_min, x_max, y_min, y_max = VIEWPORT
    viewport = pcbnew.BOX2I(
        pcbnew.VECTOR2I(x_min, y_min),
        pcbnew.VECTOR2I(x_max - x_min, y_max - y_min),
    )
    zones = list(original_board.Zones())
    partial_zones = list(subset_board.Zones())
    counters = {
        "source_zones": len(zones),
        "partial_zones": len(partial_zones),
        "source_zones_declaring_layer": 0,
        "source_outline_bbox_candidates": 0,
        "cached_fill_bbox_candidates": 0,
        "source_filled_zones_declaring_layer": 0,
    }
    if layer != subset_board.GetLayerID("In2.Cu"):
        raise ValueError("Inner copper layer IDs differ in partial source")
    for zone in zones:
        if not zone.GetLayerSet().Contains(layer):
            continue
        counters["source_zones_declaring_layer"] += 1
        if zone.IsFilled():
            counters["source_filled_zones_declaring_layer"] += 1
        outline = zone.Outline()
        if any(
            outline.Outline(i).BBox().Intersects(viewport)
            for i in range(outline.OutlineCount())
        ):
            counters["source_outline_bbox_candidates"] += 1
        filled = zone.GetFilledPolysList(layer)
        if any(
            filled.Outline(i).BBox().Intersects(viewport)
            for i in range(filled.OutlineCount())
        ):
            counters["cached_fill_bbox_candidates"] += 1
    expected = {
        "source_zones": 128,
        "partial_zones": 0,
        "source_zones_declaring_layer": 8,
        "source_outline_bbox_candidates": 6,
        "cached_fill_bbox_candidates": 4,
        "source_filled_zones_declaring_layer": 5,
    }
    if counters != expected:
        raise ValueError("Native zone outline/fill source evidence changed: " + str(counters))
    return {**counters, "counts_are_bbox_candidates_only": True}


def summarize(original, selected):
    original_board = pcbnew.LoadBoard(original)
    subset_board = pcbnew.LoadBoard(selected)
    originals = facts(original_board)
    subset = facts(subset_board)
    mismatches = [uid for uid, entry in subset.items()
                  if originals.get(uid) != entry]
    if mismatches:
        raise ValueError("Routing placement/layer/net mismatch for " +
                         str(len(mismatches)) + " UUIDs")
    counts = {
        kind: {
            "original": sum(v["class"] == kind for v in originals.values()),
            "retained": sum(v["class"] == kind for v in subset.values()),
            "original_bbox_in_viewport": sum(
                v["class"] == kind and overlaps(v["bbox"])
                for v in originals.values()
            ),
            "retained_bbox_in_viewport": sum(
                v["class"] == kind and overlaps(v["bbox"])
                for v in subset.values()
            )
        }
        for kind in KINDS
    }
    expected = {"PCB_TRACK": 24858, "PCB_VIA": 4374, "PCB_ARC": 1792}
    if {k: v["original"] for k, v in counts.items()} != expected:
        raise ValueError("Source routing population changed")
    if any(v["original_bbox_in_viewport"] <= v["retained_bbox_in_viewport"]
           for v in counts.values()):
        raise ValueError("Expected incomplete dense routing in every source kind")
    if len(subset) < 1000:
        raise ValueError("Expected two bounded source pages")
    print(json.dumps({
        "total_original": len(originals), "retained_total": len(subset),
        "mismatched_uuids": len(mismatches),
        "bbox_only_overlap": True,
        "direct_copper": direct_copper_truth(
            original_board, subset_board, set(subset)
        ),
        "pads_and_vias": pad_and_via_contact_truth(
            original_board, subset_board
        ),
        "selected_net_paths": net_path_truth(original_board, subset_board),
        "native_zone_fill": zone_fill_truth(original_board, subset_board),
        "by_kind": counts
    }, sort_keys=True))

if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit("Expected original and bounded preview PCB paths")
    summarize(sys.argv[1], sys.argv[2])

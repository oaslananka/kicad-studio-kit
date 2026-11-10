#!/usr/bin/env python3
"""Read-only KiCad 10 parity reference for genuine bounded PCB previews.

This opt-in native acceptance helper is deliberately independent of the
TypeScript source selector. Never use a partial preview for DRC or fabrication.
"""
import json
import sys


import pcbnew


def pad_facts(board):
    copper_layers = [pcbnew.F_Cu] + [
        getattr(pcbnew, "In%d_Cu" % i) for i in range(1, 31)
    ] + [pcbnew.B_Cu]
    result = {}
    for footprint in board.GetFootprints():
        origin = footprint.GetPosition()
        for pad in footprint.Pads():
            uuid = pad.m_Uuid.AsString()
            if uuid in result:
                raise ValueError("Duplicate pad UUID in KiCad source")
            position = pad.GetPosition()
            local = pad.GetFPRelativePosition()
            result[uuid] = {
                "absolute": [position.x, position.y],
                "relative": [local.x, local.y],
                "parent": [origin.x, origin.y],
                "orientation": footprint.GetOrientationDegrees(),
                "footprint_layer": footprint.GetLayer(),
                "pad_number": pad.GetNumber(),
                "net_id": pad.GetNetCode(),
                "net_name": pad.GetNetname(),
                "copper_layers": [
                    layer for layer in copper_layers
                    if pad.GetLayerSet().Contains(layer)
                ],
            }
    return result


def main(paths):
    if len(paths) != 4:
        raise ValueError("Expected original board and three bounded previews")
    original = pad_facts(pcbnew.LoadBoard(paths[0]))
    if len(original) < 1000:
        raise ValueError("Genuine KiCad dense reference has too few pads")

    report = {"original_pads": len(original), "previews": {}}
    for label, file in zip(("unfiltered", "inner", "back"), paths[1:]):
        selected = pad_facts(pcbnew.LoadBoard(file))
        mismatches = [
            uid for uid, entry in selected.items()
            if original.get(uid) != entry
        ]
        report["previews"][label] = {
            "pads": len(selected),
            "mismatches": len(mismatches),
            "rotated": sum(
                abs(entry["orientation"]) > 0.001 for entry in selected.values()
            ),
            "back_side": sum(
                entry["footprint_layer"] == pcbnew.B_Cu
                for entry in selected.values()
            ),
            "in2_copper": sum(
                pcbnew.In2_Cu in entry["copper_layers"]
                for entry in selected.values()
            ),
        }
        if not selected or mismatches:
            raise ValueError(
                "%s pad parity mismatch: %s of %s"
                % (label, len(mismatches), len(selected))
            )
    print(json.dumps(report, sort_keys=True))


if __name__ == "__main__":
    try:
        main(sys.argv[1:])
    except Exception as error:
        print("KiCad pad-parity acceptance failed: %s" % error, file=sys.stderr)
        sys.exit(2)

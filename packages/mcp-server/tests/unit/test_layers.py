from __future__ import annotations

from kipy.proto.board.board_types_pb2 import BoardLayer

from kicad_mcp.utils.layers import resolve_layer, resolve_layer_name


def test_layer_alias_resolution() -> None:
    assert resolve_layer_name("F.Cu") == "F_Cu"
    assert resolve_layer_name("In30.Cu") == "In30_Cu"


def test_resolve_layer_returns_board_layer_value() -> None:
    layer = resolve_layer("F.Cu")
    inner = resolve_layer("In30.Cu")

    assert isinstance(layer, int)
    assert layer == BoardLayer.BL_F_Cu
    assert inner == BoardLayer.Value("BL_In30_Cu")


def test_resolve_layer_rejects_unknown_layer() -> None:
    try:
        resolve_layer("Not.A.Layer")
    except ValueError as exc:
        assert "Unknown layer" in str(exc)
    else:
        raise AssertionError("resolve_layer() should reject invalid layers")

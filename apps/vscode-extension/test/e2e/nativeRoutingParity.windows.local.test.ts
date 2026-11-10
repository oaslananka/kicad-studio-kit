import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  rebuildAccumulatedPcbPreview,
  selectBoundedPcbPreview
} from '../../src/providers/viewer/densePcbPreview';

const root = path.join(
  process.env.ProgramFiles ?? 'C:\\Program Files',
  'KiCad',
  '10.0'
);
const vendorBoard = path.join(
  root,
  'share',
  'kicad',
  'demos',
  'vme-wren',
  'vme-wren.kicad_pcb'
);
const python = path.join(root, 'bin', 'python.exe');
const oracle = path.join(
  __dirname,
  '..',
  'acceptance',
  'verifyNativeRoutingSubsetParity.py'
);

test('real KiCad routing subset preserves segment, via and arc UUID/net/geometry', () => {
  test.skip(
    process.platform !== 'win32' ||
      process.env.KICADSTUDIO_LOCAL_WINDOWS_ACCEPTANCE !== '1' ||
      !fs.existsSync(vendorBoard) ||
      !fs.existsSync(python),
    'Opt-in local installed KiCad 10 read-only routing parity'
  );
  test.setTimeout(135_000);
  const sha = () =>
    createHash('sha256').update(fs.readFileSync(vendorBoard)).digest('hex');
  const originalHash = sha();
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-route-parity-'));
  try {
    const source = fs.readFileSync(vendorBoard, 'utf8');
    const viewport = { minX: 125, maxX: 215, minY: 195, maxY: 290 };
    const first = selectBoundedPcbPreview(source, {
      viewport,
      maxBytes: 2 * 1024 * 1024
    });
    const second = selectBoundedPcbPreview(source, {
      viewport,
      maxBytes: 2 * 1024 * 1024,
      cursor: first.nextCursor,
      continuationToken: first.continuationToken
    });
    const both = rebuildAccumulatedPcbPreview(source, second);
    expect(both.complete).toBe(false);
    expect(both.included['segment']).toBe(800);
    expect(both.included['via']).toBe(200);
    expect(both.included['arc']).toBeGreaterThan(0);
    for (const kind of ['segment', 'via', 'arc']) {
      expect(both.remainingAfterPage[kind]).toBeGreaterThan(0);
    }
    const subsetFile = path.join(stage, 'bounded.kicad_pcb');
    fs.writeFileSync(subsetFile, both.text, 'utf8');
    const result = spawnSync(python, [oracle, vendorBoard, subsetFile], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 95000,
      maxBuffer: 256 * 1024
    });
    if (result.error) throw result.error;
    expect(result.status, result.stderr.slice(-1100)).toBe(0);
    const report = JSON.parse(result.stdout.trim()) as {
      total_original: number;
      mismatched_uuids: number;
      retained_total: number;
      native_zone_fill: {
        source_zones: number;
        partial_zones: number;
        source_zones_declaring_layer: number;
        source_outline_bbox_candidates: number;
        cached_fill_bbox_candidates: number;
        source_filled_zones_declaring_layer: number;
        counts_are_bbox_candidates_only: boolean;
      };
      selected_net_paths: {
        fully_retained_multi_pad_routed_nets: number;
        graph_basis: string;
        selected_witnesses: Array<{
          net_code: number;
          net_name: string;
          source_route_count: number;
          partial_route_count: number;
          source_pads: number;
          partial_pads: number;
          source_explicit_path: boolean;
          partial_explicit_path: boolean;
          from: { reference: string; pad: string };
          to: { reference: string; pad: string };
        }>;
      };
      pads_and_vias: {
        original_pads: number;
        partial_pads: number;
        pad_geometry_net_mismatches: number;
        contact_categories: Record<
          string,
          {
            original_with_both_retained: number;
            partial_direct_contacts: number;
            lost_when_both_retained: number;
            fabricated_in_partial: number;
            source_contacts_to_omitted_items: number;
          }
        >;
      };
      direct_copper: {
        retained_direct_track_pairs_in_original: number;
        retained_direct_track_pairs_in_partial: number;
        retained_direct_pairs_missing_in_partial: number;
        original_direct_neighbors_missing_from_partial: number;
        partial_contacts_not_in_original: number;
        same_net_but_not_direct_track_contact_found: boolean;
      };
      by_kind: Record<
        string,
        {
          original: number;
          retained: number;
          original_bbox_in_viewport: number;
          retained_bbox_in_viewport: number;
        }
      >;
    };
    expect(report.total_original).toBe(31024);
    expect(report.mismatched_uuids).toBe(0);
    // Original KiCad cached fills are different from zone boundary
    // candidates. PARTIAL has zero zone definitions or filled copper.
    expect(report.native_zone_fill).toEqual({
      source_zones: 128,
      partial_zones: 0,
      source_zones_declaring_layer: 8,
      source_outline_bbox_candidates: 6,
      cached_fill_bbox_candidates: 4,
      source_filled_zones_declaring_layer: 5,
      counts_are_bbox_candidates_only: true
    });
    expect(report.by_kind['PCB_TRACK']?.retained).toBe(800);
    expect(report.by_kind['PCB_VIA']?.retained).toBe(200);
    expect(report.by_kind['PCB_ARC']?.retained).toBeGreaterThan(0);
    // A displayed pair of pads is not evidence of a complete physical net.
    // Native KiCad finds explicit trace/pad paths on the original board
    // that disappear when many route objects are omitted from PARTIAL.
    expect(report.selected_net_paths).toMatchObject({
      fully_retained_multi_pad_routed_nets: 0,
      graph_basis: 'native_direct_tracks_and_pads_only'
    });
    expect(report.selected_net_paths.selected_witnesses).toMatchObject([
      {
        net_code: 334,
        net_name: '/DDR4-PS.A7',
        source_route_count: 92,
        partial_route_count: 3,
        source_pads: 4,
        partial_pads: 2,
        source_explicit_path: true,
        partial_explicit_path: false,
        from: { reference: 'IC13', pad: 'R8' },
        to: { reference: 'IC14', pad: 'AA23' }
      },
      {
        net_code: 335,
        net_name: '/DDR4-PS.ACTN',
        source_route_count: 104,
        partial_route_count: 14,
        source_pads: 4,
        partial_pads: 2,
        source_explicit_path: true,
        partial_explicit_path: false,
        from: { reference: 'IC13', pad: 'L3' },
        to: { reference: 'IC14', pad: 'Y23' }
      },
      {
        net_code: 331,
        net_name: '/DDR4-PS.CSN',
        source_route_count: 123,
        partial_route_count: 31,
        source_pads: 4,
        partial_pads: 2,
        source_explicit_path: true,
        partial_explicit_path: false,
        from: { reference: 'IC13', pad: 'L7' },
        to: { reference: 'IC14', pad: 'W27' }
      }
    ]);
    expect(report.pads_and_vias).toMatchObject({
      original_pads: 6883,
      partial_pads: 1230,
      pad_geometry_net_mismatches: 0
    });
    for (const [kind, expected] of [
      ['route_pad', 312],
      ['via_pad', 3],
      ['via_route', 293]
    ] as const) {
      expect(report.pads_and_vias.contact_categories[kind]).toMatchObject({
        original_with_both_retained: expected,
        partial_direct_contacts: expected,
        lost_when_both_retained: 0,
        fabricated_in_partial: 0
      });
    }
    expect(
      report.direct_copper.retained_direct_track_pairs_in_original
    ).toBeGreaterThan(0);
    expect(
      report.direct_copper.retained_direct_track_pairs_in_partial
    ).toBeGreaterThan(0);
    expect(
      report.direct_copper.retained_direct_pairs_missing_in_partial
    ).toBeGreaterThanOrEqual(0);
    expect(
      report.direct_copper.original_direct_neighbors_missing_from_partial
    ).toBeGreaterThan(0);
    expect(report.direct_copper.partial_contacts_not_in_original).toBe(0);
    expect(
      report.direct_copper.same_net_but_not_direct_track_contact_found
    ).toBe(true);
    console.log('NATIVE_VME_BOUNDED_ROUTE_PARITY=' + JSON.stringify(report));
    expect(sha()).toBe(originalHash);
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
});

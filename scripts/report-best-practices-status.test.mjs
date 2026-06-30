import assert from "node:assert/strict";
import test from "node:test";

import {
  main,
  renderMarkdown,
  summarizeStatuses,
} from "./report-best-practices-status.mjs";

const fixture = {
  name: "kicad-studio-kit",
  updated_at: "2026-06-30T00:00:00.000Z",
  badge_percentage_0: 19,
  badge_percentage_1: 0,
  badge_percentage_2: 4,
  build_status: "?",
  build_justification: null,
  achieve_passing_status: "Unmet",
  achieve_silver_status: "Unmet",
  contribution_status: "Met",
  dynamic_analysis_status: "?",
};

test("summarizeStatuses groups remote Best Practices statuses", () => {
  const result = summarizeStatuses(fixture);
  assert.equal(result.summary["?"], 2);
  assert.equal(result.summary.Met, 1);
  assert.equal(result.summary.Unmet, 2);
  assert.deepEqual(
    result.unmet.map((entry) => entry.field),
    ["achieve_passing", "achieve_silver"],
  );
  assert.ok(result.priorityUnknown.some((entry) => entry.field === "build"));
  assert.ok(
    result.cautionUnknown.some((entry) => entry.field === "dynamic_analysis"),
  );
});

test("renderMarkdown creates a maintainer-facing status report", () => {
  const output = renderMarkdown(fixture, new Date("2026-06-30T01:02:03.000Z"));
  assert.match(output, /Best Practices Status Report/);
  assert.match(output, /Passing \| 19/);
  assert.match(output, /`achieve_passing` — Unmet/);
  assert.match(output, /`build` — \?/);
  assert.match(output, /`dynamic_analysis` — \?/);
});

test("status reporter rejects missing --input value", async () => {
  await assert.rejects(() => main(["--input"]), /--input requires a value/);
});

test("status reporter rejects missing --output value", async () => {
  await assert.rejects(
    () => main(["--output", "--write"]),
    /--output requires a value/,
  );
});

test("renderMarkdown escapes remote markdown-sensitive values", () => {
  const output = renderMarkdown(
    {
      ...fixture,
      name: "bad|name`[x]",
      updated_at: "line\nfeed",
      unsafe_field_status: "bad|status`",
    },
    new Date("2026-06-30T01:02:03.000Z"),
  );
  assert.match(output, /bad\\\|name\\`\\\[x\\\]/);
  assert.match(output, /line feed/);
  assert.match(output, /bad\\\|status\\`/);
});

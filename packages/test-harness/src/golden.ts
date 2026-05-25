import assert from "node:assert/strict";
import fs from "node:fs";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface GoldenComparison {
  pass: boolean;
  expected: string;
  actual: string;
}

export function normalizeText(value: string): string {
  return value.replace(/\r\n?/gu, "\n").trimEnd();
}

export function stableJson(value: unknown): string {
  return `${JSON.stringify(sortJson(value), null, 2)}\n`;
}

export function readGoldenText(filePath: string): string {
  return normalizeText(fs.readFileSync(filePath, "utf8"));
}

export function readGoldenJson<T = JsonValue>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

export function compareTextGolden(
  actual: string,
  expectedPath: string,
): GoldenComparison {
  const expected = readGoldenText(expectedPath);
  const normalizedActual = normalizeText(actual);
  return {
    pass: normalizedActual === expected,
    expected,
    actual: normalizedActual,
  };
}

export function assertTextMatchesGolden(
  actual: string,
  expectedPath: string,
): void {
  const comparison = compareTextGolden(actual, expectedPath);
  assert.equal(comparison.actual, comparison.expected);
}

export function assertJsonMatchesGolden(
  actual: unknown,
  expectedPath: string,
): void {
  assertTextMatchesGolden(stableJson(actual), expectedPath);
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sortJson(entry));
  }
  if (value && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortJson((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

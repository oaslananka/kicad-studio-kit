#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

export function validatePublishedBoardReadyOpsFindingsSchema(
  schema,
  expectedVersion,
) {
  const errors = [];
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    return ["Studio findings schema contract has an invalid version"];
  }
  const expectedId =
    "https://github.com/oaslananka/boardreadyops/schemas/findings-v" +
    expectedVersion +
    ".json";
  if (schema === null || typeof schema !== "object" || Array.isArray(schema)) {
    return ["Published BoardReadyOps findings schema is not a JSON object"];
  }
  if (schema.$id !== expectedId) {
    errors.push(
      "Published BoardReadyOps findings schema ID differs from Studio contract",
    );
  }
  if (schema.properties?.schemaVersion?.const !== expectedVersion) {
    errors.push(
      "Published BoardReadyOps findings schema version differs from Studio contract",
    );
  }
  return errors;
}

async function main() {
  // The trusted workflow reads canonical compatibility.yaml and passes the
  // expected version. No filesystem path or external JSON selects the contract.
  const expected = Number(process.env.EXPECTED_SCHEMA_VERSION);
  let raw = "";
  for await (const chunk of process.stdin) {
    raw += chunk;
    if (raw.length > 2_000_000) {
      throw new Error(
        "Published findings schema exceeds the bounded input budget",
      );
    }
  }
  const schema = JSON.parse(raw);
  const errors = validatePublishedBoardReadyOpsFindingsSchema(schema, expected);
  if (errors.length) {
    throw new Error(errors.join("\n"));
  }
  console.log(
    "Published BoardReadyOps findings schema matches Studio v" + expected,
  );
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

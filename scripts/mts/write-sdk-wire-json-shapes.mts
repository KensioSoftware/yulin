#!/usr/bin/env -S pnpm tsx

/**
 * Writes the snapshot of AWS JSON protocol input members the wire bridge
 * decodes: the blobs and timestamps of each bridged service's operation
 * inputs, derived from the installed SDK client packages.
 *
 * The snapshot is committed, because implementation code under `src/` does
 * not import the SDK. A test fails when it no longer matches the installed
 * SDK. Run this to move it on, with `pnpm run sdk:wire-shapes`.
 */

import { writeFile } from "node:fs/promises";
import path from "node:path";

import { deriveSdkWireJsonShapes } from "../../test/sdk/wire/sdk-wire-json-shapes.js";

const outputPath = path.resolve(
  import.meta.dirname,
  "../../src/sdk/wire/sim-sdk-wire-json-shapes.json",
);

await writeFile(
  outputPath,
  `${JSON.stringify(await deriveSdkWireJsonShapes(), undefined, 2)}\n`,
);

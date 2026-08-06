#!/usr/bin/env node

/* v8 ignore start -- the entry point runs as its own process, so coverage of
 * this repository's test run never sees it. What it does is covered through
 * `SimCli`, and that it works as a command is covered by running it. */

import { SimCli } from "./sim-cli.js";

try {
  process.exitCode = await new SimCli().run(process.argv.slice(2));
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}

/* v8 ignore stop */

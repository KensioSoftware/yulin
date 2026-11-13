/**
 * Publishing a version of a function that has changed since its last one.
 *
 * Real Lambda answers a PublishVersion with nothing changed since the latest
 * version with that version, so a test that wants a second version number has
 * to change the function first. The description is the cheapest change to
 * make, and the wait lets the update settle, since a function still being
 * updated refuses to publish.
 *
 * This lives under `test/` for the same reason as the other fixtures here.
 * Eslint rejects a test file that exports helpers alongside its own `describe`
 * calls.
 */

import { randomUUID } from "node:crypto";

import {
  PublishVersionCommand,
  UpdateFunctionConfigurationCommand,
} from "@aws-sdk/client-lambda";

import type { SimAws } from "../../src/service/aws/sim-aws.js";

/**
 * Change a function's description, then publish it, answering with the
 * version number it was published under.
 */
export async function publishChangedVersion(
  simAws: SimAws,
  functionName: string,
): Promise<string> {
  await simAws.lambda().updateFunctionConfiguration(
    new UpdateFunctionConfigurationCommand({
      FunctionName: functionName,
      Description: randomUUID(),
    }),
  );
  await simAws.backgroundTasksComplete();
  const published = await simAws
    .lambda()
    .publishVersion(new PublishVersionCommand({ FunctionName: functionName }));

  return published.Version;
}

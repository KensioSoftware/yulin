/**
 * Setup and readback helpers the simulated CloudWatch Logs tests share.
 *
 * This lives under `test/` for the same reasons as `test/sns/`: eslint rejects
 * a test file that exports helpers alongside its own `describe` calls, and
 * `test/**` is type-checked with everything else, excluded from the published
 * build, not collected as a suite, and not counted in coverage.
 *
 * Nearly every test here needs a group, some streams and a way to read names
 * back out of a response, and writing that out per file made the test files
 * dense enough to breach the FTA gate. Sharing it keeps each test to the part
 * that is actually about the behaviour under test.
 */

import {
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  DescribeLogGroupsCommand,
  DescribeLogStreamsCommand,
  FilterLogEventsCommand,
  PutLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";

import type { SimClock } from "../../src/util/clock/sim-clock.js";
import { SimAws } from "../../src/service/aws/sim-aws.js";
import type { SimLogs } from "../../src/service/logs/sim-logs.js";

/** The log group nearly every one of these tests writes to. */
export const simLogsGroupName = "/aws/lambda/orders";

/**
 * A simulated CloudWatch Logs holding one log group and the streams named.
 */
export async function simLogsWithStreams(
  logStreamNames: readonly string[],
  clock?: SimClock,
): Promise<SimLogs> {
  const logs = new SimAws(clock === undefined ? {} : { clock }).logs();

  await logs.createLogGroup(
    new CreateLogGroupCommand({ logGroupName: simLogsGroupName }),
  );

  for (const logStreamName of logStreamNames) {
    // oxlint-disable-next-line no-await-in-loop -- creation order is asserted
    await logs.createLogStream(
      new CreateLogStreamCommand({
        logGroupName: simLogsGroupName,
        logStreamName,
      }),
    );
  }

  return logs;
}

/**
 * A simulated CloudWatch Logs holding the log groups named, in that order.
 */
export async function simLogsWithGroups(
  logGroupNames: readonly string[],
): Promise<SimLogs> {
  const logs = new SimAws().logs();

  for (const logGroupName of logGroupNames) {
    // oxlint-disable-next-line no-await-in-loop -- creation order is asserted
    await logs.createLogGroup(new CreateLogGroupCommand({ logGroupName }));
  }

  return logs;
}

/**
 * Write one event to a stream in the shared log group.
 */
export async function simLogsPutEvent(
  logs: SimLogs,
  logStreamName: string,
  timestamp: number,
  message: string,
): Promise<void> {
  await logs.putLogEvents(
    new PutLogEventsCommand({
      logGroupName: simLogsGroupName,
      logStreamName,
      logEvents: [{ timestamp, message }],
    }),
  );
}

/**
 * Make a stream in the shared log group, so a test asserting on a refusal does
 * not repeat the command around each name it tries.
 */
export async function simLogsCreateStream(
  logs: SimLogs,
  logStreamName: string,
): Promise<void> {
  await logs.createLogStream(
    new CreateLogStreamCommand({
      logGroupName: simLogsGroupName,
      logStreamName,
    }),
  );
}

/**
 * A log group whose execution environments each wrote the lines given, made in
 * the order the streams are listed in.
 */
export async function simLogsWithWrittenStreams(
  written: Readonly<Record<string, readonly (readonly [number, string])[]>>,
): Promise<SimLogs> {
  const logs = await simLogsWithStreams(Object.keys(written));

  for (const [logStreamName, lines] of Object.entries(written)) {
    for (const [timestamp, message] of lines) {
      // oxlint-disable-next-line no-await-in-loop -- ingestion order is asserted
      await simLogsPutEvent(logs, logStreamName, timestamp, message);
    }
  }

  return logs;
}

/**
 * A log group whose two execution environments each wrote two lines, so that
 * the newest and the oldest event are on different streams.
 *
 * That shape is what makes a search worth asserting on: reading one stream
 * would answer with the wrong order, and a test that only ever had one stream
 * could not tell the difference.
 */
export async function simLogsWithTwoStreams(): Promise<SimLogs> {
  return await simLogsWithWrittenStreams({
    "stream-cold": [
      [1000, "INFO starting up"],
      [3000, "ERROR order has no items"],
    ],
    "stream-warm": [
      [2000, "INFO handling order-2"],
      [4000, "WARN retrying downstream call"],
    ],
  });
}

type DescribeStreamsInput = ConstructorParameters<
  typeof DescribeLogStreamsCommand
>[0];

/**
 * The names of the streams a DescribeLogStreams request reports, in the order
 * it reports them, together with the token that reaches the next page.
 */
export async function simLogsStreamNames(
  logs: SimLogs,
  input: DescribeStreamsInput = {},
): Promise<{
  readonly names: readonly string[];
  readonly nextToken: string | undefined;
}> {
  const described = await logs.describeLogStreams(
    new DescribeLogStreamsCommand({
      logGroupName: simLogsGroupName,
      ...input,
    }),
  );

  return {
    names: described.logStreams?.map((stream) => stream.logStreamName) ?? [],
    nextToken: described.nextToken,
  };
}

type DescribeGroupsInput = ConstructorParameters<
  typeof DescribeLogGroupsCommand
>[0];

/**
 * The names of the log groups a DescribeLogGroups request reports, and the
 * token that reaches the next page.
 */
export async function simLogsGroupNames(
  logs: SimLogs,
  input: DescribeGroupsInput = {},
): Promise<{
  readonly names: readonly string[];
  readonly nextToken: string | undefined;
}> {
  const described = await logs.describeLogGroups(
    new DescribeLogGroupsCommand(input),
  );

  return {
    names: described.logGroups?.map((group) => group.logGroupName) ?? [],
    nextToken: described.nextToken,
  };
}

type FilterInput = ConstructorParameters<typeof FilterLogEventsCommand>[0];

/**
 * Search the shared log group.
 */
export async function simLogsFilter(
  logs: SimLogs,
  input: FilterInput = {},
): Promise<Awaited<ReturnType<SimLogs["filterLogEvents"]>>> {
  return await logs.filterLogEvents(
    new FilterLogEventsCommand({ logGroupName: simLogsGroupName, ...input }),
  );
}

import { FilterLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";
import {
  assertArrayEquals,
  assertArrayLength,
  assertInstanceOf,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  simLogsFilter,
  simLogsGroupName,
  simLogsWithTwoStreams,
} from "../../../test/logs/log-group-fixture.js";
import { SimAws } from "../aws/sim-aws.js";
import {
  SimLogsInvalidParameterException,
  SimLogsResourceNotFoundException,
} from "./error/sim-logs.error.js";

describe("SimLogs FilterLogEvents selection", () => {
  it("narrows a search to a half open time window", async () => {
    // Given the same log group.
    const logs = await simLogsWithTwoStreams();

    // When a window is searched from the second event up to the fourth.
    const found = await simLogsFilter(logs, { startTime: 2000, endTime: 4000 });

    // Then the start is included and the end is not.
    assertArrayEquals(
      found.events?.map((event) => event.timestamp),
      [2000, 3000],
    );
  });

  it("searches named streams, or streams under a prefix", async () => {
    // Given the same log group.
    const logs = await simLogsWithTwoStreams();

    // When one stream is named, and then a prefix is used.
    const named = await simLogsFilter(logs, {
      logStreamNames: ["stream-warm", "never-created"],
    });
    const prefixed = await simLogsFilter(logs, {
      logStreamNamePrefix: "stream-c",
    });

    // Then only those streams are searched, and a name nothing has simply
    // contributes nothing rather than failing.
    assertArrayEquals(
      named.events?.map((event) => event.logStreamName),
      ["stream-warm", "stream-warm"],
    );
    assertArrayEquals(
      prefixed.events?.map((event) => event.logStreamName),
      ["stream-cold", "stream-cold"],
    );
  });

  it("refuses an empty list of stream names", async () => {
    // Given the same log group.
    const logs = await simLogsWithTwoStreams();

    // When a caller builds the list dynamically and it comes out empty.
    const error = await assertThrowsErrorAsync(
      async () => await simLogsFilter(logs, { logStreamNames: [] }),
    );

    // Then it is refused, as real CloudWatch Logs refuses it, rather than
    // answering with an empty page that looks like nothing matched.
    assertInstanceOf(error, SimLogsInvalidParameterException);
  });

  it("refuses both stream selectors at once", async () => {
    // Given the same log group.
    const logs = await simLogsWithTwoStreams();

    // When named streams and a name prefix are both given.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simLogsFilter(logs, {
          logStreamNames: ["stream-warm"],
          logStreamNamePrefix: "stream-",
        }),
    );

    // Then it is refused rather than one of them quietly winning.
    assertInstanceOf(error, SimLogsInvalidParameterException);
  });

  it("pages a search", async () => {
    // Given a log group with four events.
    const logs = await simLogsWithTwoStreams();

    // When they are searched three at a time.
    const first = await simLogsFilter(logs, { limit: 3 });
    const second = await simLogsFilter(logs, {
      limit: 3,
      nextToken: first.nextToken,
    });

    // Then the second page carries on from the first and ends the walk.
    assertArrayLength(first.events ?? [], 3);
    assertArrayEquals(
      second.events?.map((event) => event.message),
      ["WARN retrying downstream call"],
    );
    assertUndefined(second.nextToken);
  });

  it("refuses a search of a log group that is not there", async () => {
    // Given a simulated CloudWatch Logs holding nothing.
    const logs = new SimAws().logs();

    // When a group that was never made is searched.
    const error = await assertThrowsErrorAsync(
      async () =>
        await logs.filterLogEvents(
          new FilterLogEventsCommand({ logGroupName: simLogsGroupName }),
        ),
    );

    // Then it fails as an unknown log group.
    assertInstanceOf(error, SimLogsResourceNotFoundException);
  });
});

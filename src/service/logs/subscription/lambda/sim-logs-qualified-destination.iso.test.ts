import {
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  PutLogEventsCommand,
  PutSubscriptionFilterCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import {
  assertArrayEquals,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  simLambdaAliasedFunction,
  simLambdaAllowAliasInvoke,
} from "../../../../../test/lambda/alias-fixture.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { simLogsServicePrincipal } from "./sim-logs-destination-permission.js";

const logGroupName = "/aws/lambda/orders";
const logStreamName = "2026/08/19/[$LATEST]abc";

/**
 * A simulation with a log group and a stream to write to.
 */
async function simAwsWithLogGroup(): Promise<SimAws> {
  const simAws = new SimAws();

  await simAws
    .logs()
    .createLogGroup(new CreateLogGroupCommand({ logGroupName }));
  await simAws
    .logs()
    .createLogStream(
      new CreateLogStreamCommand({ logGroupName, logStreamName }),
    );

  return simAws;
}

/**
 * Subscribe a destination to everything the group receives.
 */
async function subscribe(
  simAws: SimAws,
  destinationArn: string,
): Promise<void> {
  await simAws.logs().putSubscriptionFilter(
    new PutSubscriptionFilterCommand({
      logGroupName,
      filterName: "errors",
      filterPattern: "",
      destinationArn,
    }),
  );
}

describe("A CloudWatch Logs subscription filter delivering to a Lambda alias", () => {
  it("delivers to the version the alias points at", async () => {
    // Given a log group and a function whose alias admits CloudWatch Logs.
    const simAws = await simAwsWithLogGroup();
    const tracker = await simLambdaAliasedFunction(simAws, "error-tracker");
    await simLambdaAllowAliasInvoke(
      simAws,
      "error-tracker",
      simLogsServicePrincipal(simAws.defaultRegionName),
    );

    // When the alias is subscribed and a line is written.
    await subscribe(simAws, tracker.aliasArn);
    await simAws.logs().putLogEvents(
      new PutLogEventsCommand({
        logGroupName,
        logStreamName,
        logEvents: [{ timestamp: 1000, message: "order failed" }],
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the version behind the alias ran, rather than `$LATEST`.
    assertArrayEquals(tracker.ranAs, [tracker.version]);
  });

  it("refuses a destination naming no version or alias", async () => {
    // Given a log group and a function with an alias.
    const simAws = await simAwsWithLogGroup();
    const tracker = await simLambdaAliasedFunction(simAws, "error-tracker");
    await simLambdaAllowAliasInvoke(
      simAws,
      "error-tracker",
      simLogsServicePrincipal(simAws.defaultRegionName),
    );

    // When a filter names an alias the function does not have.
    const error = await assertThrowsErrorAsync(async () => {
      await subscribe(simAws, `${tracker.functionArn}:old`);
    });

    // Then it is refused where the filter is put, as a missing function is.
    assertStringIncludes(
      error.message,
      "names no simulated Lambda function version or alias",
    );
  });
});

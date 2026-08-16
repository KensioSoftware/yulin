import {
  CreateLogGroupCommand,
  PutSubscriptionFilterCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import {
  DeleteFunctionCommand,
  RemovePermissionCommand,
} from "@aws-sdk/client-lambda";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  simLogsSubscribedGroupName as logGroupName,
  simLogsWithTracker,
  simLogsWriteLines,
} from "../../../../test/logs/subscription-fixture.js";
import { SimLogs } from "../sim-logs.js";
import { SimLogsDeliveryNotPermitted } from "../error/sim-logs-delivery.error.js";
import { SimLogsNoSubscriptionDestinations } from "./sim-logs-subscription-destinations.js";

describe("CloudWatch Logs subscription filter delivery failures", () => {
  it("does not fail the write when the destination throws", async () => {
    // Given a subscription to a function whose handler always fails.
    const { simAws, trackerArn } = await simLogsWithTracker({ failing: true });

    await simAws.logs().putSubscriptionFilter(
      new PutSubscriptionFilterCommand({
        logGroupName,
        filterName: "errors-to-tracker",
        filterPattern: "",
        destinationArn: trackerArn,
      }),
    );

    // When the group is written to.
    await simLogsWriteLines(simAws, ["ERROR order has no items"]);

    // Then the write succeeded and the failure is kept for a test to find,
    // rather than being lost the way it is in an account.
    const failure = simAws.logs().subscriptionFailures.at(0);

    assertNonNullable(failure);
    assertIdentical(failure.filterName, "errors-to-tracker");
    assertStringIncludes(failure.reason, "tracker is down");
  });

  it("refuses a destination the log group may not invoke", async () => {
    // Given a tracker function that has not granted CloudWatch Logs anything.
    const { simAws, trackerArn } = await simLogsWithTracker({
      withoutPermission: true,
    });

    // When a filter is put on it.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.logs().putSubscriptionFilter(
          new PutSubscriptionFilterCommand({
            logGroupName,
            filterName: "errors-to-tracker",
            filterPattern: "",
            destinationArn: trackerArn,
          }),
        ),
    );

    // Then it fails there, as real CloudWatch Logs fails it, rather than
    // leaving a filter that silently drops every event from then on.
    assertIdentical(error.name, "InvalidParameterException");
    assertStringIncludes(
      error.message,
      "Make sure you have given CloudWatch Logs permission",
    );
  });

  it("stops delivering once the permission is taken away", async () => {
    // Given a working subscription.
    const { simAws, received, trackerArn } = await simLogsWithTracker();

    await simAws.logs().putSubscriptionFilter(
      new PutSubscriptionFilterCommand({
        logGroupName,
        filterName: "errors-to-tracker",
        filterPattern: "",
        destinationArn: trackerArn,
      }),
    );

    // When the function's permission is removed and the group is written to.
    await simAws.lambda().removePermission(
      new RemovePermissionCommand({
        FunctionName: "error-tracker",
        StatementId: "logs",
      }),
    );
    await simLogsWriteLines(simAws, ["ERROR order has no items"]);

    // Then nothing was delivered, because the resource policy is consulted on
    // every delivery rather than remembered from when the filter was put.
    assertArrayLength(received, 0);
    assertArrayLength(simAws.logs().subscriptionFailures, 1);
  });

  it("refuses a destination that is not a simulated Lambda function", async () => {
    // Given a log group and a Kinesis stream ARN, which real CloudWatch Logs
    // takes as a destination and this simulation has no machinery for.
    const { simAws } = await simLogsWithTracker();

    // When a filter is put on it.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.logs().putSubscriptionFilter(
          new PutSubscriptionFilterCommand({
            logGroupName,
            filterName: "errors-to-stream",
            filterPattern: "",
            destinationArn: `arn:aws:kinesis:${simAws.defaultRegionName}:${simAws.defaultAccountId}:stream/orders`,
          }),
        ),
    );

    // Then it says only a Lambda destination is simulated, rather than
    // accepting it and delivering nothing.
    assertIdentical(error.name, "UnsupportedOperationException");
    assertStringIncludes(error.message, "Only a Lambda destination");
  });

  it("refuses a delivery from a SimLogs built on its own", async () => {
    // Given a standalone SimLogs, which has nothing to deliver to.
    const logs = new SimLogs();

    await logs.createLogGroup(new CreateLogGroupCommand({ logGroupName }));

    // When a filter is put on one of its groups.
    const error = await assertThrowsErrorAsync(
      async () =>
        await logs.putSubscriptionFilter(
          new PutSubscriptionFilterCommand({
            logGroupName,
            filterName: "errors-to-tracker",
            filterPattern: "",
            destinationArn:
              "arn:aws:lambda:us-east-1:111111111111:function:error-tracker",
          }),
        ),
    );

    // Then it says how to get one, rather than holding a filter that could
    // never reach anything.
    assertIdentical(error.name, "UnsupportedOperationException");
    assertStringIncludes(error.message, "Reach simulated CloudWatch Logs");
  });

  it("delivers nothing when no event matches the filter", async () => {
    // Given a subscription for one term only.
    const { simAws, received, trackerArn } = await simLogsWithTracker();

    await simAws.logs().putSubscriptionFilter(
      new PutSubscriptionFilterCommand({
        logGroupName,
        filterName: "errors-to-tracker",
        filterPattern: "ERROR",
        destinationArn: trackerArn,
      }),
    );

    // When lines that none of them match are written.
    await simLogsWriteLines(simAws, [
      "INFO starting up",
      "INFO handling order-1",
    ]);

    // Then nothing was delivered and nothing failed: a filter that matches no
    // event is not a delivery that went wrong.
    assertArrayLength(received, 0);
    assertArrayLength(simAws.logs().subscriptionFailures, 0);
  });

  it("records a destination function that is not there", async () => {
    // Given a filter put while its destination existed, and the function gone
    // by the time an event arrives.
    const { simAws, trackerArn } = await simLogsWithTracker();

    await simAws.logs().putSubscriptionFilter(
      new PutSubscriptionFilterCommand({
        logGroupName,
        filterName: "errors-to-tracker",
        filterPattern: "",
        destinationArn: trackerArn,
      }),
    );
    await simAws
      .lambda()
      .deleteFunction(
        new DeleteFunctionCommand({ FunctionName: "error-tracker" }),
      );

    // When the group is written to.
    await simLogsWriteLines(simAws, ["ERROR order has no items"]);

    // Then the delivery is recorded as failed rather than throwing into the
    // write that triggered it.
    assertStringIncludes(
      simAws.logs().subscriptionFailures.at(0)?.reason ?? "",
      "not a simulated Lambda function",
    );
  });

  it("refuses a delivery a standalone SimLogs is asked to make", async () => {
    // Given the destinations a SimLogs built on its own has.
    const destinations = new SimLogsNoSubscriptionDestinations();

    // When it is asked to deliver rather than only to check.
    const error = await assertThrowsErrorAsync(async () => {
      await destinations.deliver("arn:aws:lambda:us-east-1:1:function:x");
    });

    // Then it refuses the same way it refuses the check, so a delivery that
    // somehow got past the check still says how to get one.
    assertStringIncludes(error.message, "Reach simulated CloudWatch Logs");
  });

  it("keeps the delivery failure type for a destination that went away", () => {
    // Given the error a delivery failure carries.
    const error = new SimLogsDeliveryNotPermitted("no");

    // Then it is reported as the parameter failure real CloudWatch Logs
    // reports for a destination it cannot invoke.
    assertIdentical(error.name, "InvalidParameterException");
  });
});

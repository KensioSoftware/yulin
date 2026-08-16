import { gunzipSync } from "node:zlib";
import {
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  PutLogEventsCommand,
  PutSubscriptionFilterCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";
import {
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../lambda/function/code/lambda-zip-file-input.js";
import type { SimLogsSubscriptionEventDocument } from "./sim-logs-subscription-event.js";

const logGroupName = "/aws/lambda/orders";
const logStreamName = "2026/08/16/[$LATEST]abc";

interface SubscribedSimulation {
  readonly simAws: SimAws;
  readonly received: unknown[];
  readonly trackerArn: string;
}

/**
 * A simulation with a tracker function that records what it was handed, and a
 * log group ready to be subscribed.
 */
async function simAwsWithTracker(
  permitted = true,
): Promise<SubscribedSimulation> {
  const simAws = new SimAws();
  const received: unknown[] = [];

  await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: "error-tracker",
      Role: `arn:aws:iam::${simAws.defaultAccountId}:role/TrackerRole`,
      Code: {
        ZipFile: makeLambdaZipFileInput((event: unknown) => {
          received.push(event);

          return "recorded";
        }),
      },
    }),
  );
  await simAws.backgroundTasksComplete();

  if (permitted) {
    await simAws.lambda().addPermission(
      new AddPermissionCommand({
        FunctionName: "error-tracker",
        StatementId: "logs",
        Action: "lambda:InvokeFunction",
        Principal: `logs.${simAws.defaultRegionName}.amazonaws.com`,
      }),
    );
  }

  await simAws
    .logs()
    .createLogGroup(new CreateLogGroupCommand({ logGroupName }));
  await simAws
    .logs()
    .createLogStream(
      new CreateLogStreamCommand({ logGroupName, logStreamName }),
    );

  return {
    simAws,
    received,
    trackerArn: `arn:aws:lambda:${simAws.defaultRegionName}:${simAws.defaultAccountId}:function:error-tracker`,
  };
}

/**
 * The decoded document a Lambda destination was handed.
 */
function decoded(payload: unknown): SimLogsSubscriptionEventDocument {
  const data = (payload as { awslogs: { data: string } }).awslogs.data;

  return JSON.parse(
    gunzipSync(Buffer.from(data, "base64")).toString("utf8"),
  ) as SimLogsSubscriptionEventDocument;
}

async function writeLines(
  simAws: SimAws,
  lines: readonly string[],
): Promise<void> {
  await simAws.logs().putLogEvents(
    new PutLogEventsCommand({
      logGroupName,
      logStreamName,
      logEvents: lines.map((message, index) => ({
        timestamp: 1000 + index,
        message,
      })),
    }),
  );
  await simAws.backgroundTasksComplete();
}

describe("CloudWatch Logs subscription filter delivery", () => {
  it("delivers matched events to a Lambda destination", async () => {
    // Given a log group subscribed to an error tracker function.
    const { simAws, received, trackerArn } = await simAwsWithTracker();

    await simAws.logs().putSubscriptionFilter(
      new PutSubscriptionFilterCommand({
        logGroupName,
        filterName: "errors-to-tracker",
        filterPattern: "ERROR",
        destinationArn: trackerArn,
      }),
    );

    // When the group is written to.
    await writeLines(simAws, ["INFO starting up", "ERROR order has no items"]);

    // Then the tracker was handed the matching line and nothing else, in the
    // gzipped and base64 encoded shape every real subscription handler
    // decodes.
    assertArrayLength(received, 1);

    const document = decoded(received.at(0));

    assertIdentical(document.messageType, "DATA_MESSAGE");
    assertIdentical(document.owner, simAws.defaultAccountId);
    assertIdentical(document.logGroup, logGroupName);
    assertIdentical(document.logStream, logStreamName);
    assertArrayEquals(document.subscriptionFilters, ["errors-to-tracker"]);
    assertArrayEquals(
      document.logEvents.map((event) => event.message),
      ["ERROR order has no items"],
    );
  });

  it("delivers what a Lambda function logged for itself", async () => {
    // Given a subscription on the log group a function writes to, and nothing
    // calling PutLogEvents directly.
    const { simAws, received, trackerArn } = await simAwsWithTracker();

    await simAws.logs().putSubscriptionFilter(
      new PutSubscriptionFilterCommand({
        logGroupName,
        filterName: "errors-to-tracker",
        filterPattern: "ERROR",
        destinationArn: trackerArn,
      }),
    );

    // When a simulated service records output into that group.
    simAws
      .logs()
      .serviceWriter()
      .write(logGroupName, logStreamName, ["ERROR order failed"]);
    await simAws.backgroundTasksComplete();

    // Then the subscription picked it up, so a handler's own output reaches
    // the function subscribed to its logs.
    assertArrayLength(received, 1);
    assertArrayEquals(
      decoded(received.at(0)).logEvents.map((event) => event.message),
      ["ERROR order failed"],
    );
  });
});

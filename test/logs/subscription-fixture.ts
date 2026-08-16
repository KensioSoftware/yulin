/**
 * A simulated AWS with a log group subscribed to a tracker function, which
 * every CloudWatch Logs subscription delivery test needs before it can say
 * anything about a delivery.
 *
 * This lives under `test/` for the same reasons as `test/sns/`: eslint rejects
 * a test file that exports helpers alongside its own `describe` calls, and
 * `test/**` is type-checked with everything else, excluded from the published
 * build, not collected as a suite, and not counted in coverage.
 */

import { gunzipSync } from "node:zlib";

import {
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  PutLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "../../src/service/aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../src/service/lambda/function/code/lambda-zip-file-input.js";
import type { SimLogsSubscriptionEventDocument } from "../../src/service/logs/subscription/sim-logs-subscription-event.js";

/** The log group every one of these tests subscribes to. */
export const simLogsSubscribedGroupName = "/aws/lambda/orders";

/** The stream those tests write to. */
export const simLogsSubscribedStreamName = "2026/08/16/[$LATEST]abc";

/**
 * A simulation ready to be subscribed, and what its tracker was handed.
 */
export interface SimLogsTrackerFixture {
  readonly simAws: SimAws;
  readonly received: unknown[];
  readonly trackerArn: string;
}

/**
 * How a test wants its tracker to differ from the usual one.
 */
export interface SimLogsTrackerOptions {
  /**
   * Left out to grant `logs.<region>.amazonaws.com` the invoke action, which
   * is what putting a subscription filter on the function needs.
   */
  readonly withoutPermission?: boolean;

  /**
   * Left out for a tracker that records what it was handed. Set for one that
   * fails, which is how a delivery failure is arranged.
   */
  readonly failing?: boolean;
}

/**
 * A simulated AWS with a tracker function and a log group ready to subscribe.
 */
export async function simLogsWithTracker(
  options: SimLogsTrackerOptions = {},
): Promise<SimLogsTrackerFixture> {
  const simAws = new SimAws();
  const received: unknown[] = [];

  await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: "error-tracker",
      Role: `arn:aws:iam::${simAws.defaultAccountId}:role/TrackerRole`,
      Code: {
        ZipFile: makeLambdaZipFileInput((event: unknown) => {
          if (options.failing === true) {
            throw new Error("tracker is down");
          }

          received.push(event);

          return "recorded";
        }),
      },
    }),
  );
  await simAws.backgroundTasksComplete();

  if (options.withoutPermission !== true) {
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
    .createLogGroup(
      new CreateLogGroupCommand({ logGroupName: simLogsSubscribedGroupName }),
    );
  await simAws.logs().createLogStream(
    new CreateLogStreamCommand({
      logGroupName: simLogsSubscribedGroupName,
      logStreamName: simLogsSubscribedStreamName,
    }),
  );

  return {
    simAws,
    received,
    trackerArn: `arn:aws:lambda:${simAws.defaultRegionName}:${simAws.defaultAccountId}:function:error-tracker`,
  };
}

/**
 * Write lines to the subscribed stream and wait for delivery.
 */
export async function simLogsWriteLines(
  simAws: SimAws,
  lines: readonly string[],
): Promise<void> {
  await simAws.logs().putLogEvents(
    new PutLogEventsCommand({
      logGroupName: simLogsSubscribedGroupName,
      logStreamName: simLogsSubscribedStreamName,
      logEvents: lines.map((message, index) => ({
        timestamp: 1000 + index,
        message,
      })),
    }),
  );
  await simAws.backgroundTasksComplete();
}

/**
 * The decoded document a Lambda destination was handed.
 */
export function simLogsDecodedDelivery(
  payload: unknown,
): SimLogsSubscriptionEventDocument {
  const { data } = (payload as { awslogs: { data: string } }).awslogs;

  return JSON.parse(
    gunzipSync(Buffer.from(data, "base64")).toString("utf8"),
  ) as SimLogsSubscriptionEventDocument;
}

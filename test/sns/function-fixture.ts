/**
 * A simulated AWS with a Lambda function subscribed to a topic, which every SNS
 * Lambda delivery test needs before it can say anything about an invocation.
 *
 * This lives under `test/` for the same reasons as `test/sns/topic-fixture.ts`:
 * eslint rejects a test file that exports helpers alongside its own `describe`
 * calls, and `test/**` is type-checked with everything else, excluded from the
 * published build, not collected as a suite, and not counted in coverage.
 */

import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";
import { SubscribeCommand } from "@aws-sdk/client-sns";
import { assertNonNullable } from "@kensio/smartass";

import type { SimAws } from "../../src/service/aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../src/service/lambda/function/code/lambda-zip-file-input.js";
import type { SimSnsScope } from "./subscription-fixture.js";

/**
 * One record of the event a subscribed function is invoked with.
 *
 * The `Sns` object is read as a bag of values rather than typed field by field,
 * because what a test is checking is that the right names carry the right
 * values, including the two whose spelling differs from the SQS envelope.
 */
export interface SimSnsLambdaRecord {
  readonly EventSource: string;
  readonly EventVersion: string;
  readonly EventSubscriptionArn: string;
  readonly Sns: Record<string, unknown>;
}

/**
 * The event document SNS invokes a subscribed function with.
 */
export interface SimSnsLambdaEvent {
  readonly Records: readonly SimSnsLambdaRecord[];
}

/**
 * A function subscribed to a topic, and what it has been invoked with.
 */
export interface SimSnsFunctionFixture {
  readonly functionArn: string;
  readonly events: SimSnsLambdaEvent[];
}

/**
 * How a test wants its subscribed function to differ from the usual one.
 */
export interface SimSnsFunctionOptions extends SimSnsScope {
  /**
   * Left out to grant `sns.amazonaws.com` the invoke action for the topic,
   * which is what a delivery needs.
   */
  readonly withoutPermission?: boolean;

  /**
   * What the handler does once it has recorded the event it received.
   */
  readonly onEvent?: () => void;
}

/**
 * The ARN a function of a name has in a scope.
 */
export function simSnsFunctionArn(
  simAws: SimAws,
  functionName: string,
  scope: SimSnsScope = {},
): string {
  const accountId = scope.accountId ?? simAws.defaultAccountId;
  const regionName = scope.regionName ?? simAws.defaultRegionName;

  return `arn:aws:lambda:${regionName}:${accountId}:function:${functionName}`;
}

/**
 * Grant `sns.amazonaws.com` the invoke action on a function for one topic.
 *
 * This is the grant real SNS needs on the function's side, and it is the one
 * AWS documents: the service principal, the invoke action, and the topic it is
 * invoking for as the source ARN.
 */
export async function simSnsAllowInvoke(
  simAws: SimAws,
  functionName: string,
  topicArn: string,
  scope: SimSnsScope = {},
): Promise<void> {
  await simAws
    .account(scope.accountId ?? simAws.defaultAccountId)
    .region(scope.regionName ?? simAws.defaultRegionName)
    .lambda()
    .addPermission(
      new AddPermissionCommand({
        FunctionName: functionName,
        StatementId: "AllowSns",
        Action: "lambda:InvokeFunction",
        Principal: "sns.amazonaws.com",
        SourceArn: topicArn,
      }),
    );
}

/**
 * Subscribe a function ARN to a topic over the `lambda` protocol.
 */
export async function subscribeFunction(
  simAws: SimAws,
  topicArn: string | undefined,
  functionArn: string,
): Promise<string> {
  const subscribed = await simAws.sns().subscribe(
    new SubscribeCommand({
      TopicArn: topicArn,
      Protocol: "lambda",
      Endpoint: functionArn,
    }),
  );

  assertNonNullable(
    subscribed.SubscriptionArn,
    "Subscribe answered with an ARN",
  );

  return subscribed.SubscriptionArn;
}

/**
 * Create a function that records what it is invoked with, and subscribe it.
 *
 * The recorded events are the array this answers with, so a test asserts
 * against the event document itself rather than against something the handler
 * decided to keep out of it.
 */
export async function simSnsSubscribedFunction(
  simAws: SimAws,
  functionName: string,
  topicArn: string,
  options: SimSnsFunctionOptions = {},
): Promise<SimSnsFunctionFixture> {
  const events: SimSnsLambdaEvent[] = [];
  const lambda = simAws
    .account(options.accountId ?? simAws.defaultAccountId)
    .region(options.regionName ?? simAws.defaultRegionName)
    .lambda();

  await lambda.createFunction(
    new CreateFunctionCommand({
      FunctionName: functionName,
      Role: `arn:aws:iam::${options.accountId ?? simAws.defaultAccountId}:role/${functionName}Role`,
      Code: {
        ZipFile: makeLambdaZipFileInput((event: SimSnsLambdaEvent) => {
          events.push(event);
          options.onEvent?.();

          return "handled";
        }),
      },
    }),
  );

  if (options.withoutPermission !== true) {
    await simSnsAllowInvoke(simAws, functionName, topicArn, options);
  }

  const functionArn = simSnsFunctionArn(simAws, functionName, options);

  await subscribeFunction(simAws, topicArn, functionArn);

  return { functionArn, events };
}

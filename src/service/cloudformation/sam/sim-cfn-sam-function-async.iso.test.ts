import { InvokeCommand, ListTagsCommand } from "@aws-sdk/client-lambda";
import { ReceiveMessageCommand } from "@aws-sdk/client-sqs";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertObjectEquals,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { SimSqsQueue } from "../../sqs/queue/sim-sqs-queue.js";
import type { SimCfnDeployedStack } from "../stack/sim-cfn-deployed-stack.type.js";
import type { SimCfnTemplateValueRecord } from "../template/value/sim-cfn-template-value.js";
import {
  samFunctionTemplateLogicalId,
  simCfnSamFunctionTemplateFactory,
} from "./function/sim-cfn-sam-function-template.factory.js";

/**
 * Deploy the SAM function with the given properties, backed by a handler that
 * always fails, so an asynchronous invocation of it ends up wherever the
 * template sends failures.
 */
async function deployFailingRates(
  simAws: SimAws,
  functionProperties: SimCfnTemplateValueRecord,
  resources: SimCfnTemplateValueRecord = {},
): Promise<SimCfnDeployedStack> {
  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "rates-stack",
    template: simCfnSamFunctionTemplateFactory.make({
      functionProperties,
      resources,
    }),
    bindings: [
      {
        logicalId: samFunctionTemplateLogicalId,
        handler: (): never => {
          throw new Error("rates handler failed");
        },
      },
    ],
  });
  await stack.waitForDeployComplete();

  return stack;
}

/**
 * Invoke the function asynchronously and let every retry run out.
 */
async function invokeAndExhaustRetries(simAws: SimAws): Promise<void> {
  await simAws.lambda().invoke(
    new InvokeCommand({
      FunctionName: "rates",
      InvocationType: "Event",
      Payload: JSON.stringify({ currency: "GBP" }),
    }),
  );
  await simAws.backgroundTasksComplete();
  await simAws.clock().advanceBy({ minutes: 5 });
}

/**
 * The bodies waiting on a queue.
 */
async function queuedBodies(
  simAws: SimAws,
  queueUrl: string | undefined,
): Promise<string[]> {
  assertNonNullable(queueUrl, "the queue URL");
  const received = await simAws.sqs().receiveMessage(
    new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: 10,
    }),
  );

  return (received.Messages ?? []).map((message) => message.Body);
}

describe("SAM Serverless Function asynchronous delivery and tags", () => {
  it("tags the function with its Tags and the tag SAM adds", async () => {
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "rates-stack",
      template: simCfnSamFunctionTemplateFactory.make({
        functionProperties: { Tags: { team: "payments" } },
      }),
    });
    await stack.waitForDeployComplete();

    const simFunction = simAws.lambda().getSimFunctionByName("rates");
    assertNonNullable(simFunction);
    const listed = await simAws
      .lambda()
      .listTags(new ListTagsCommand({ Resource: simFunction.arn }));

    assertObjectEquals(listed.Tags, {
      "lambda:createdBy": "SAM",
      team: "payments",
    });
  });

  it("dead-letters to the queue its DeadLetterQueue names, with the Role allowed to send", async () => {
    // Given a SAM function dead-lettering to a queue in the same template,
    // running as the Role SAM generates for it.
    const simAws = new SimAws();
    await deployFailingRates(
      simAws,
      {
        DeadLetterQueue: {
          Type: "SQS",
          TargetArn: { "Fn::GetAtt": ["RatesDeadLetters", "Arn"] },
        },
      },
      {
        RatesDeadLetters: {
          Type: "AWS::SQS::Queue",
          Properties: { QueueName: "rates-dlq" },
        },
      },
    );

    // When an asynchronous invocation fails every attempt.
    await invokeAndExhaustRetries(simAws);

    // Then the event waits on the dead-letter queue.
    const bodies = await queuedBodies(
      simAws,
      simAws.sqs().findQueue("rates-dlq")?.url,
    );
    assertArrayLength(bodies, 1);
    assertStringIncludes(bodies[0], "GBP");
  });

  it("sends a failure to the queue SAM creates for an OnFailure naming only a Type", async () => {
    // Given a SAM function whose EventInvokeConfig sends failures to an SQS
    // destination it names no queue for, with no retries.
    const simAws = new SimAws();
    const stack = await deployFailingRates(simAws, {
      EventInvokeConfig: {
        MaximumRetryAttempts: 0,
        DestinationConfig: { OnFailure: { Type: "SQS" } },
      },
    });

    // When an asynchronous invocation fails.
    await invokeAndExhaustRetries(simAws);

    // Then the failure record waits on the queue SAM created.
    const createdQueue = stack.getResource(
      "RatesEventInvokeConfigOnFailureQueue",
    )?.simResource;
    assertInstanceOf(createdQueue, SimSqsQueue);
    const bodies = await queuedBodies(simAws, createdQueue.url);
    assertArrayLength(bodies, 1);
    const record = JSON.parse(bodies[0]) as {
      requestContext: { condition: string; approximateInvokeCount: number };
    };
    assertIdentical(record.requestContext.condition, "RetriesExhausted");
    assertIdentical(record.requestContext.approximateInvokeCount, 1);
  });

  it("merges Globals Tags with a function's own", async () => {
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "rates-stack",
      template: simCfnSamFunctionTemplateFactory.make({
        globals: { Tags: { stage: "test", team: "platform" } },
        functionProperties: { Tags: { team: "payments" } },
      }),
    });
    await stack.waitForDeployComplete();

    const simFunction = simAws.lambda().getSimFunctionByName("rates");
    assertNonNullable(simFunction);
    const listed = await simAws
      .lambda()
      .listTags(new ListTagsCommand({ Resource: simFunction.arn }));

    assertObjectEquals(listed.Tags, {
      "lambda:createdBy": "SAM",
      stage: "test",
      team: "payments",
    });
  });

  it("keeps a Globals destination when a function states only its retries", async () => {
    // Given a Globals EventInvokeConfig sending failures to a queue, and a
    // function overriding only the retries.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "rates-stack",
      template: simCfnSamFunctionTemplateFactory.make({
        globals: {
          EventInvokeConfig: {
            MaximumRetryAttempts: 2,
            DestinationConfig: { OnFailure: { Type: "SQS" } },
          },
        },
        functionProperties: { EventInvokeConfig: { MaximumRetryAttempts: 0 } },
      }),
      bindings: [
        {
          logicalId: samFunctionTemplateLogicalId,
          handler: (): never => {
            throw new Error("rates handler failed");
          },
        },
      ],
    });
    await stack.waitForDeployComplete();

    // When an asynchronous invocation fails.
    await invokeAndExhaustRetries(simAws);

    // Then the failure reaches the queue after the function's single attempt.
    const createdQueue = stack.getResource(
      "RatesEventInvokeConfigOnFailureQueue",
    )?.simResource;
    assertInstanceOf(createdQueue, SimSqsQueue);
    const bodies = await queuedBodies(simAws, createdQueue.url);
    assertArrayLength(bodies, 1);
    const record = JSON.parse(bodies[0]) as {
      requestContext: { approximateInvokeCount: number };
    };
    assertIdentical(record.requestContext.approximateInvokeCount, 1);
  });
});

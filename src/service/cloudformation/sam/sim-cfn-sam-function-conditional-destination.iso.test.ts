import { InvokeCommand } from "@aws-sdk/client-lambda";
import { ReceiveMessageCommand } from "@aws-sdk/client-sqs";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertInstanceOf,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { SimSqsQueue } from "../../sqs/queue/sim-sqs-queue.js";
import type { SimCfnDeployedStack } from "../stack/sim-cfn-deployed-stack.type.js";
import {
  samFunctionTemplateLogicalId,
  simCfnSamFunctionTemplateFactory,
} from "./function/sim-cfn-sam-function-template.factory.js";

/**
 * Deploy a failing SAM function whose OnFailure destination is the queue
 * `LiveFailures` when `IsLive` holds, and nothing otherwise.
 */
async function deployWithLiveCondition(
  simAws: SimAws,
  isLive: boolean,
): Promise<SimCfnDeployedStack> {
  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "rates-stack",
    template: {
      ...simCfnSamFunctionTemplateFactory.make({
        functionProperties: {
          EventInvokeConfig: {
            MaximumRetryAttempts: 0,
            DestinationConfig: {
              OnFailure: {
                Type: "SQS",
                Destination: {
                  "Fn::If": [
                    "IsLive",
                    { "Fn::GetAtt": ["LiveFailures", "Arn"] },
                    { Ref: "AWS::NoValue" },
                  ],
                },
              },
            },
          },
        },
        resources: { LiveFailures: { Type: "AWS::SQS::Queue" } },
      }),
      Conditions: { IsLive: { "Fn::Equals": [String(isLive), "true"] } },
    },
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
  await simAws
    .lambda()
    .invoke(
      new InvokeCommand({ FunctionName: "rates", InvocationType: "Event" }),
    );
  await simAws.backgroundTasksComplete();
  await simAws.clock().advanceBy({ minutes: 5 });

  return stack;
}

async function queued(
  simAws: SimAws,
  queue: SimSqsQueue,
): Promise<readonly unknown[]> {
  const received = await simAws
    .sqs()
    .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queue.url }));

  return received.Messages ?? [];
}

describe("a SAM EventInvokeConfig destination written as Fn::If", () => {
  it("sends a failure to the stated queue where the condition holds", async () => {
    // Given the condition holding, and an asynchronous invocation that fails.
    const simAws = new SimAws();
    const stack = await deployWithLiveCondition(simAws, true);

    // Then SAM created no queue, and the stated one received the failure.
    const stated = stack.getResource("LiveFailures")?.simResource;
    assertInstanceOf(stated, SimSqsQueue);
    assertUndefined(
      stack.getResource("RatesEventInvokeConfigOnFailureQueue")?.simResource,
    );
    assertArrayLength(await queued(simAws, stated), 1);
  });

  it("sends a failure to the queue SAM creates where it does not", async () => {
    // Given the condition failing, and an asynchronous invocation that fails.
    const simAws = new SimAws();
    const stack = await deployWithLiveCondition(simAws, false);

    // Then the queue SAM created for the other branch received the failure.
    const created = stack.getResource(
      "RatesEventInvokeConfigOnFailureQueue",
    )?.simResource;
    const stated = stack.getResource("LiveFailures")?.simResource;
    assertInstanceOf(created, SimSqsQueue);
    assertInstanceOf(stated, SimSqsQueue);
    assertArrayLength(await queued(simAws, created), 1);
    assertArrayEmpty(await queued(simAws, stated));
  });
});

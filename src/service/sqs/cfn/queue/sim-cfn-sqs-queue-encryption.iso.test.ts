import { GetQueueAttributesCommand } from "@aws-sdk/client-sqs";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { SimCfnDeployedStack } from "../../../cloudformation/stack/sim-cfn-deployed-stack.type.js";
import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";

/** Deploy an encrypted queue reusing its data key for the given period. */
async function deployQueue(
  simAws: SimAws,
  reusePeriod: SimCfnTemplateValue,
): Promise<SimCfnDeployedStack> {
  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "orders-stack",
    template: {
      Resources: {
        OrdersQueue: {
          Type: "AWS::SQS::Queue",
          Properties: {
            QueueName: "orders",
            KmsMasterKeyId: "alias/aws/sqs",
            KmsDataKeyReusePeriodSeconds: reusePeriod,
          },
        },
      },
    },
  });
  await stack.waitForDeployComplete();

  return stack;
}

describe("AWS::SQS::Queue KmsDataKeyReusePeriodSeconds", () => {
  it("records a period real SQS accepts and creates the queue without it", async () => {
    // Given a template reusing its data key for five minutes, which is the
    // default real SQS applies.
    const simAws = new SimAws();

    // When the template is deployed.
    const stack = await deployQueue(simAws, 300);

    // Then the queue exists, since encryption changes nothing a test here can
    // observe, and both encryption properties are recorded against it.
    assertNonNullable(simAws.sqs().findQueue("orders"));

    const recorded = stack.ignoredProperties.map((entry) => entry.path);
    assertArrayLength(recorded, 2);
    assertStringIncludes(recorded.join(", "), "KmsDataKeyReusePeriodSeconds");

    // And nothing acts on it, so the queue reports no such attribute.
    const read = await simAws.sqs().getQueueAttributes(
      new GetQueueAttributesCommand({
        QueueUrl: "https://sqs.us-east-1.amazonaws.com/888888888888/orders",
        AttributeNames: ["All"],
      }),
    );
    assertUndefined(read.Attributes?.["KmsDataKeyReusePeriodSeconds"]);
  });

  it("refuses a period shorter than the minute real SQS takes", async () => {
    // Given a template reusing its data key for thirty seconds.
    const simAws = new SimAws();

    // When the template is deployed, then the Resource fails. Nothing here
    // encrypts anything, and a stack that deployed would report a template
    // CloudFormation fails at CreateQueue as working.
    const error = await assertThrowsErrorAsync(async () => {
      return await deployQueue(simAws, 30);
    });

    assertStringIncludes(
      error.message,
      "KmsDataKeyReusePeriodSeconds 30 is outside the 60 to 86400 seconds " +
        "real SQS accepts",
    );

    // And nothing was recorded against a Resource that never existed.
    const stack = simAws.cloudFormation().getStackByName("orders-stack");
    assertNonNullable(stack);
    assertArrayLength(stack.ignoredProperties, 0);
    assertIdentical(stack.getResource("OrdersQueue")?.status, "CREATE_FAILED");
    assertUndefined(simAws.sqs().findQueue("orders"));
  });

  it("refuses a period longer than the day real SQS takes", async () => {
    // Given a template reusing its data key for a week.
    // When it is deployed, then the far end of the range is refused too.
    const error = await assertThrowsErrorAsync(async () => {
      return await deployQueue(new SimAws(), 604_800);
    });

    assertStringIncludes(error.message, "is outside the 60 to 86400 seconds");
  });

  it("refuses a period that is not a whole number of seconds", async () => {
    // Given a template stating something no period could be read out of.
    // When it is deployed, then it is refused rather than read as zero.
    const error = await assertThrowsErrorAsync(async () => {
      return await deployQueue(new SimAws(), "five minutes");
    });

    assertStringIncludes(
      error.message,
      "KmsDataKeyReusePeriodSeconds five minutes is outside",
    );
  });

  it("refuses a period stated as something no number could come from", async () => {
    // Given a template stating an object where a number belongs.
    // When it is deployed, then it is refused, naming what the template said
    // rather than the reading of it.
    const error = await assertThrowsErrorAsync(async () => {
      return await deployQueue(new SimAws(), { Minutes: 5 });
    });

    assertStringIncludes(
      error.message,
      'KmsDataKeyReusePeriodSeconds {"Minutes":5} is outside',
    );
  });

  it("takes a period a template Parameter carries as a string", async () => {
    // Given a template taking the period from a Parameter, which resolves to
    // a string where a literal property carries a number.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      parameters: { ReusePeriod: "600" },
      template: {
        Parameters: { ReusePeriod: { Type: "Number" } },
        Resources: {
          OrdersQueue: {
            Type: "AWS::SQS::Queue",
            Properties: {
              QueueName: "orders",
              KmsDataKeyReusePeriodSeconds: { Ref: "ReusePeriod" },
            },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then the queue exists, because the string holds a period in range.
    assertNonNullable(simAws.sqs().findQueue("orders"));
  });
});

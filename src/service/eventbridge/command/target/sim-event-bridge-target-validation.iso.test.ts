import {
  PutRuleCommand,
  PutTargetsCommand,
  type Target,
} from "@aws-sdk/client-eventbridge";
import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimEventBridgeUnsimulatedInputException,
  SimEventBridgeValidationException,
} from "../../error/sim-event-bridge.error.js";

const orderPattern = JSON.stringify({ source: ["orders.service"] });

const queueArn = "arn:aws:sqs:us-east-1:888888888888:orders";

/**
 * Try to add targets to a rule, and answer with what it was refused with.
 */
async function refusedTargets(targets: readonly Target[]): Promise<Error> {
  const simAws = new SimAws();

  await simAws
    .eventBridge()
    .putRule(
      new PutRuleCommand({ Name: "orders", EventPattern: orderPattern }),
    );

  return await assertThrowsErrorAsync(async () => {
    await simAws
      .eventBridge()
      .putTargets(
        new PutTargetsCommand({ Rule: "orders", Targets: [...targets] }),
      );
  });
}

describe("EventBridge target validation", () => {
  it("refuses a target naming a service it cannot deliver to", async () => {
    // Given a target naming a Step Functions state machine.
    const error = await refusedTargets([
      {
        Id: "workflow",
        Arn: "arn:aws:states:us-east-1:888888888888:stateMachine:orders",
      },
    ]);

    // Then it is refused when the target is added rather than when an event
    // first matches, and it names what can be delivered to.
    assertInstanceOf(error, SimEventBridgeValidationException);
    assertStringIncludes(error.message, "lambda, sqs, sns");
  });

  it("refuses a target ARN that is not an ARN", async () => {
    const error = await refusedTargets([{ Id: "queue", Arn: "orders" }]);

    assertInstanceOf(error, SimEventBridgeValidationException);
    assertStringIncludes(error.message, "is not an ARN");
  });

  it("refuses a target with no id or no ARN", async () => {
    const noId = await refusedTargets([{ Id: undefined, Arn: queueArn }]);
    const noArn = await refusedTargets([{ Id: "queue", Arn: undefined }]);

    assertInstanceOf(noId, SimEventBridgeValidationException);
    assertStringIncludes(noId.message, "Target Id is required");
    assertInstanceOf(noArn, SimEventBridgeValidationException);
    assertStringIncludes(noArn.message, "Target Arn is required");
  });

  it("refuses a target id real EventBridge would refuse", async () => {
    const error = await refusedTargets([{ Id: "orders queue", Arn: queueArn }]);

    assertInstanceOf(error, SimEventBridgeValidationException);
    assertStringIncludes(error.message, "orders queue");
  });

  it("refuses an input that is not JSON, when the target is added", async () => {
    // Given a target whose fixed input could never be sent.
    const error = await refusedTargets([
      { Id: "queue", Arn: queueArn, Input: "not json" },
    ]);

    // Then it is refused here rather than failing every delivery later.
    assertInstanceOf(error, SimEventBridgeValidationException);
    assertStringIncludes(error.message, "not valid JSON");
  });

  it("refuses a request carrying no targets", async () => {
    const error = await refusedTargets([]);

    assertInstanceOf(error, SimEventBridgeValidationException);
  });

  it("refuses more targets than a rule may have", async () => {
    // Given six targets where a rule takes five.
    const error = await refusedTargets(
      Array.from({ length: 6 }, (_, index) => ({
        Id: `target-${String(index)}`,
        Arn: queueArn,
      })),
    );

    assertInstanceOf(error, SimEventBridgeValidationException);
    assertStringIncludes(error.message, "at most 5");
  });

  it("counts the targets a rule already has against the limit", async () => {
    // Given a rule already at the limit.
    const simAws = new SimAws();

    await simAws
      .eventBridge()
      .putRule(
        new PutRuleCommand({ Name: "orders", EventPattern: orderPattern }),
      );
    await simAws.eventBridge().putTargets(
      new PutTargetsCommand({
        Rule: "orders",
        Targets: Array.from({ length: 5 }, (_, index) => ({
          Id: `target-${String(index)}`,
          Arn: queueArn,
        })),
      }),
    );

    // When one more is added.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.eventBridge().putTargets(
        new PutTargetsCommand({
          Rule: "orders",
          Targets: [{ Id: "one-more", Arn: queueArn }],
        }),
      );
    });

    // Then it is refused, since replacing an existing id is the only way to
    // put a sixth request through.
    assertInstanceOf(error, SimEventBridgeValidationException);
  });

  it("refuses target properties it does not model rather than dropping them", async () => {
    // Given targets carrying each unmodelled property in turn.
    const unmodelled: readonly Target[] = [
      { Id: "t", Arn: queueArn, InputPath: "$.detail" },
      {
        Id: "t",
        Arn: queueArn,
        InputTransformer: { InputTemplate: '{"id": <id>}' },
      },
      { Id: "t", Arn: queueArn, RoleArn: "arn:aws:iam::888888888888:role/R" },
      {
        Id: "t",
        Arn: queueArn,
        DeadLetterConfig: { Arn: "arn:aws:sqs:us-east-1:888888888888:dlq" },
      },
      { Id: "t", Arn: queueArn, RetryPolicy: { MaximumRetryAttempts: 2 } },
      { Id: "t", Arn: queueArn, SqsParameters: { MessageGroupId: "orders" } },
      { Id: "t", Arn: queueArn, HttpParameters: { PathParameterValues: [] } },
    ];

    // Then each is refused, so nothing looks configured that is not.
    for (const target of unmodelled) {
      // oxlint-disable-next-line no-await-in-loop
      const error = await refusedTargets([target]);

      assertInstanceOf(error, SimEventBridgeUnsimulatedInputException);
    }
  });
});

import {
  DeleteRuleCommand,
  ListRuleNamesByTargetCommand,
  ListTargetsByRuleCommand,
  PutRuleCommand,
  PutTargetsCommand,
  RemoveTargetsCommand,
} from "@aws-sdk/client-eventbridge";
import {
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";

const orderPattern = JSON.stringify({ source: ["orders.service"] });

const queueArn = "arn:aws:sqs:us-east-1:888888888888:orders";

const topicArn = "arn:aws:sns:us-east-1:888888888888:orders";

/**
 * A simulated AWS with one rule to hang targets on.
 */
async function simAwsWithRule(name = "orders"): Promise<SimAws> {
  const simAws = new SimAws();

  await simAws
    .eventBridge()
    .putRule(new PutRuleCommand({ Name: name, EventPattern: orderPattern }));

  return simAws;
}

describe("EventBridge target commands", () => {
  it("adds targets to a rule and lists them in the order they were added", async () => {
    // Given a rule.
    const simAws = await simAwsWithRule();

    // When two targets are added.
    const put = await simAws.eventBridge().putTargets(
      new PutTargetsCommand({
        Rule: "orders",
        Targets: [
          { Id: "queue", Arn: queueArn },
          { Id: "topic", Arn: topicArn, Input: '{"note":"placed"}' },
        ],
      }),
    );

    // Then neither failed, and both come back in order.
    assertIdentical(put.FailedEntryCount, 0);

    const listed = await simAws
      .eventBridge()
      .listTargetsByRule(new ListTargetsByRuleCommand({ Rule: "orders" }));

    assertArrayEquals(
      listed.Targets?.map((target) => target.Id),
      ["queue", "topic"],
    );
    assertIdentical(listed.Targets[1]?.Input, '{"note":"placed"}');
  });

  it("replaces a target of the same id rather than adding a second", async () => {
    // Given a rule with a target.
    const simAws = await simAwsWithRule();

    await simAws.eventBridge().putTargets(
      new PutTargetsCommand({
        Rule: "orders",
        Targets: [{ Id: "main", Arn: queueArn }],
      }),
    );

    // When a target of the same id is put with a different ARN.
    await simAws.eventBridge().putTargets(
      new PutTargetsCommand({
        Rule: "orders",
        Targets: [{ Id: "main", Arn: topicArn }],
      }),
    );

    // Then there is still one target, with the new ARN.
    const listed = await simAws
      .eventBridge()
      .listTargetsByRule(new ListTargetsByRuleCommand({ Rule: "orders" }));

    assertArrayLength(listed.Targets ?? [], 1);
    assertIdentical(listed.Targets?.[0]?.Arn, topicArn);
  });

  it("removes targets by id, and reports an id the rule does not have", async () => {
    // Given a rule with one target.
    const simAws = await simAwsWithRule();

    await simAws.eventBridge().putTargets(
      new PutTargetsCommand({
        Rule: "orders",
        Targets: [{ Id: "main", Arn: queueArn }],
      }),
    );

    // When that target and one that was never there are removed.
    const removed = await simAws.eventBridge().removeTargets(
      new RemoveTargetsCommand({
        Rule: "orders",
        Ids: ["main", "ghost"],
      }),
    );

    // Then the real one is gone, and the other is a failed entry rather than
    // a failed request.
    assertIdentical(removed.FailedEntryCount, 1);
    assertIdentical(removed.FailedEntries?.[0]?.TargetId, "ghost");
    assertArrayLength(simAws.eventBridge().ruleTargets("orders"), 0);
  });

  it("lists the rules that send to a target", async () => {
    // Given two rules targeting the same queue and one targeting a topic.
    const simAws = await simAwsWithRule("orders");

    await simAws
      .eventBridge()
      .putRule(
        new PutRuleCommand({ Name: "audit", EventPattern: orderPattern }),
      );
    await simAws
      .eventBridge()
      .putRule(
        new PutRuleCommand({ Name: "notify", EventPattern: orderPattern }),
      );

    for (const [rule, arn] of [
      ["orders", queueArn],
      ["audit", queueArn],
      ["notify", topicArn],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop
      await simAws.eventBridge().putTargets(
        new PutTargetsCommand({
          Rule: rule,
          Targets: [{ Id: "main", Arn: arn }],
        }),
      );
    }

    // When the rules sending to the queue are listed.
    const listed = await simAws
      .eventBridge()
      .listRuleNamesByTarget(
        new ListRuleNamesByTargetCommand({ TargetArn: queueArn }),
      );

    // Then only the two that name it come back.
    assertArrayEquals(listed.RuleNames, ["orders", "audit"]);
  });

  it("takes a rule's targets with it when the rule is deleted", async () => {
    // Given a rule with a target.
    const simAws = await simAwsWithRule();

    await simAws.eventBridge().putTargets(
      new PutTargetsCommand({
        Rule: "orders",
        Targets: [{ Id: "main", Arn: queueArn }],
      }),
    );

    // When the rule is deleted and recreated under the same name.
    await simAws
      .eventBridge()
      .deleteRule(new DeleteRuleCommand({ Name: "orders" }));
    await simAws
      .eventBridge()
      .putRule(
        new PutRuleCommand({ Name: "orders", EventPattern: orderPattern }),
      );

    // Then the new rule has no targets, rather than inheriting the old ones.
    assertArrayLength(simAws.eventBridge().ruleTargets("orders"), 0);
  });

  it("keeps the targets of two buses' rules of the same name apart", async () => {
    // Given a rule of the same name on two buses, each with its own target.
    const simAws = await simAwsWithRule();

    await simAws.eventBridge().createEventBus({ input: { Name: "billing" } });
    await simAws.eventBridge().putRule(
      new PutRuleCommand({
        Name: "orders",
        EventBusName: "billing",
        EventPattern: orderPattern,
      }),
    );
    await simAws.eventBridge().putTargets(
      new PutTargetsCommand({
        Rule: "orders",
        Targets: [{ Id: "default-bus", Arn: queueArn }],
      }),
    );
    await simAws.eventBridge().putTargets(
      new PutTargetsCommand({
        Rule: "orders",
        EventBusName: "billing",
        Targets: [{ Id: "billing-bus", Arn: topicArn }],
      }),
    );

    // Then each rule has only its own.
    const onDefault = simAws.eventBridge().ruleTargets("orders");
    const onBilling = simAws.eventBridge().ruleTargets("orders", "billing");

    assertNonNullable(onDefault[0]);
    assertIdentical(onDefault[0].id, "default-bus");
    assertNonNullable(onBilling[0]);
    assertIdentical(onBilling[0].id, "billing-bus");
  });

  it("lists nothing for a rule with no targets, and removes nothing when asked for nothing", async () => {
    // Given a rule with no targets.
    const simAws = await simAwsWithRule();

    // When its targets are listed, and a removal names no ids.
    const listed = await simAws
      .eventBridge()
      .listTargetsByRule(new ListTargetsByRuleCommand({ Rule: "orders" }));
    const removed = await simAws
      .eventBridge()
      .removeTargets(
        new RemoveTargetsCommand({ Rule: "orders", Ids: undefined }),
      );

    // Then both are answered rather than refused.
    assertArrayLength(listed.Targets ?? [], 0);
    assertIdentical(removed.FailedEntryCount, 0);
  });

  it("reads the qualifier out of a qualified Lambda target ARN", async () => {
    // Given a target ARN carrying a version after the function name.
    const simAws = await simAwsWithRule();

    await simAws.eventBridge().putTargets(
      new PutTargetsCommand({
        Rule: "orders",
        Targets: [
          {
            Id: "fulfilment",
            Arn: "arn:aws:lambda:us-east-1:888888888888:function:fulfilment:2",
          },
        ],
      }),
    );

    // Then the name and the version it names are both read, so the rule
    // delivers to the version rather than to `$LATEST`.
    const [target] = simAws.eventBridge().ruleTargets("orders");

    assertNonNullable(target);
    assertIdentical(target.arn.functionName, "fulfilment");
    assertIdentical(target.arn.functionQualifier, "2");
  });
});

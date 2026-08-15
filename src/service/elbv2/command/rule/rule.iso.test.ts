import {
  CreateRuleCommand,
  DeleteRuleCommand,
  DescribeRulesCommand,
  ModifyRuleCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimElbV2PriorityInUseException,
  SimElbV2RuleNotFoundException,
  SimElbV2ValidationError,
} from "../../error/sim-elbv2.error.js";
import {
  createFixtureLambdaTargetGroup,
  createFixtureListener,
  createFixtureLoadBalancer,
  createFixtureRule,
} from "../../sim-elbv2.fixture.js";

interface RuleFixture {
  readonly elbV2: ReturnType<SimAws["elbV2"]>;
  readonly listenerArn: string;
  readonly targetGroupArn: string;
}

async function makeListener(): Promise<RuleFixture> {
  const simAws = new SimAws();
  const elbV2 = simAws.account("555555555555").region("eu-west-1").elbV2();
  const loadBalancerArn = await createFixtureLoadBalancer(elbV2);
  const targetGroupArn = await createFixtureLambdaTargetGroup(elbV2);
  const listenerArn = await createFixtureListener(
    elbV2,
    loadBalancerArn,
    targetGroupArn,
  );

  return { elbV2, listenerArn, targetGroupArn };
}

describe("ELBv2 listener rules", () => {
  it("creates a rule whose ARN is built from its listener's", async () => {
    // Given a listener.
    const { elbV2, listenerArn, targetGroupArn } = await makeListener();

    // When a rule is written on it.
    const output = await elbV2.createRule(
      new CreateRuleCommand({
        ListenerArn: listenerArn,
        Priority: 10,
        Conditions: [{ Field: "path-pattern", Values: ["/checkout/*"] }],
        Actions: [{ Type: "forward", TargetGroupArn: targetGroupArn }],
      }),
    );

    // Then the rule reports its priority as a string, as real ELB does.
    assertArrayLength(output.Rules, 1);

    const rule = output.Rules[0];
    assertIdentical(
      rule.RuleArn,
      "arn:aws:elasticloadbalancing:eu-west-1:555555555555:listener-rule/app/" +
        "shop-alb/0000000000000001/0000000000000001/0000000000000001",
    );
    assertIdentical(rule.Priority, "10");
    assertFalse(rule.IsDefault);
  });

  it("refuses a second rule claiming a priority already taken", async () => {
    // Given a listener with a rule at priority 10.
    const { elbV2, listenerArn, targetGroupArn } = await makeListener();
    await createFixtureRule(elbV2, listenerArn, 10, targetGroupArn);

    // When another rule claims the same priority.
    const error = await assertThrowsErrorAsync(async () => {
      await createFixtureRule(elbV2, listenerArn, 10, targetGroupArn);
    });

    assertInstanceOf(error, SimElbV2PriorityInUseException);

    // Then it is refused, since which one claimed a request would be undefined.
    assertStringIncludes(error.message, "Priority 10 is already in use");
  });

  it("refuses a priority outside the range, or none at all", async () => {
    // Given a listener.
    const { elbV2, listenerArn, targetGroupArn } = await makeListener();

    // When rules are written with no priority and with an impossible one.
    const none = await assertThrowsErrorAsync(async () => {
      await elbV2.createRule({
        input: {
          ListenerArn: listenerArn,
          Conditions: [{ Field: "host-header", Values: ["shop.example.com"] }],
          Actions: [{ Type: "forward", TargetGroupArn: targetGroupArn }],
        },
      });
    });

    assertInstanceOf(none, SimElbV2ValidationError);

    const outOfRange = await assertThrowsErrorAsync(async () => {
      await createFixtureRule(elbV2, listenerArn, 50_001, targetGroupArn);
    });

    assertInstanceOf(outOfRange, SimElbV2ValidationError);

    // Then both are refused.
    assertStringIncludes(none.message, "Priority is required");
    assertStringIncludes(outOfRange.message, "between 1 and 50000");
  });

  it("describes a listener's rules in priority order with the default rule last", async () => {
    // Given a listener with two rules written out of order.
    const { elbV2, listenerArn, targetGroupArn } = await makeListener();
    await createFixtureRule(elbV2, listenerArn, 20, targetGroupArn, "b.test");
    await createFixtureRule(elbV2, listenerArn, 10, targetGroupArn, "a.test");

    // When the listener's rules are described.
    const output = await elbV2.describeRules(
      new DescribeRulesCommand({ ListenerArn: listenerArn }),
    );

    // Then they come back in evaluation order, ending in the default rule.
    assertArrayLength(output.Rules, 3);
    assertIdentical(output.Rules[0].Priority, "10");
    assertIdentical(output.Rules[1].Priority, "20");
    assertIdentical(output.Rules[2].Priority, "default");
    assertTrue(output.Rules[2].IsDefault);
    assertArrayLength(output.Rules[2].Actions, 1);
    assertIdentical(output.Rules[2].Actions[0].TargetGroupArn, targetGroupArn);
  });

  it("describes rules by ARN, and refuses naming neither way", async () => {
    // Given a listener with one rule.
    const { elbV2, listenerArn, targetGroupArn } = await makeListener();
    const ruleArn = await createFixtureRule(
      elbV2,
      listenerArn,
      10,
      targetGroupArn,
    );

    // When it is described by ARN, and then with nothing named.
    const byArn = await elbV2.describeRules(
      new DescribeRulesCommand({ RuleArns: [ruleArn] }),
    );
    const error = await assertThrowsErrorAsync(async () => {
      await elbV2.describeRules({ input: {} });
    });

    assertInstanceOf(error, SimElbV2ValidationError);

    // Then the ARN answers and naming neither is refused.
    assertArrayLength(byArn.Rules, 1);
    assertStringIncludes(error.message, "either RuleArns");
  });

  it("changes a rule's conditions and actions but not its priority", async () => {
    // Given a rule at priority 10.
    const { elbV2, listenerArn, targetGroupArn } = await makeListener();
    const ruleArn = await createFixtureRule(
      elbV2,
      listenerArn,
      10,
      targetGroupArn,
    );

    // When its conditions and actions are changed.
    const output = await elbV2.modifyRule(
      new ModifyRuleCommand({
        RuleArn: ruleArn,
        Conditions: [{ Field: "path-pattern", Values: ["/orders"] }],
        Actions: [
          {
            Type: "redirect",
            RedirectConfig: { StatusCode: "HTTP_301", Host: "new.example.com" },
          },
        ],
      }),
    );

    // Then the change took and the priority stayed where it was.
    assertArrayLength(output.Rules, 1);

    const rule = output.Rules[0];
    assertIdentical(rule.Priority, "10");
    assertArrayLength(rule.Conditions, 1);
    assertArrayLength(rule.Actions, 1);
    assertIdentical(rule.Conditions[0].Field, "path-pattern");
    assertIdentical(rule.Actions[0].Type, "redirect");
  });

  it("leaves a rule's actions alone when a modify names only conditions", async () => {
    // Given a rule forwarding to a target group.
    const { elbV2, listenerArn, targetGroupArn } = await makeListener();
    const ruleArn = await createFixtureRule(
      elbV2,
      listenerArn,
      10,
      targetGroupArn,
    );

    // When only its conditions are changed.
    const output = await elbV2.modifyRule(
      new ModifyRuleCommand({
        RuleArn: ruleArn,
        Conditions: [{ Field: "path-pattern", Values: ["/checkout/*"] }],
      }),
    );

    // Then its actions came through untouched.
    assertArrayLength(output.Rules, 1);
    assertArrayLength(output.Rules[0].Actions, 1);
    assertIdentical(output.Rules[0].Actions[0].TargetGroupArn, targetGroupArn);
    assertArrayLength(output.Rules[0].Conditions, 1);
    assertIdentical(output.Rules[0].Conditions[0].Field, "path-pattern");
  });

  it("frees a priority when the rule holding it is deleted", async () => {
    // Given a rule at priority 10.
    const { elbV2, listenerArn, targetGroupArn } = await makeListener();
    const ruleArn = await createFixtureRule(
      elbV2,
      listenerArn,
      10,
      targetGroupArn,
    );

    // When it is deleted and another takes its place.
    await elbV2.deleteRule(new DeleteRuleCommand({ RuleArn: ruleArn }));
    await createFixtureRule(elbV2, listenerArn, 10, targetGroupArn);

    // Then the priority was free again.
    const output = await elbV2.describeRules(
      new DescribeRulesCommand({ ListenerArn: listenerArn }),
    );
    assertArrayLength(output.Rules, 2);
  });

  it("refuses a rule request naming no rule, or one that is gone", async () => {
    // Given simulated ELBv2.
    const { elbV2 } = await makeListener();

    // When a modify and a delete leave out the ARN or name an unknown one.
    const noModifyArn = await assertThrowsErrorAsync(async () => {
      await elbV2.modifyRule({ input: {} });
    });

    assertInstanceOf(noModifyArn, SimElbV2ValidationError);

    const noDeleteArn = await assertThrowsErrorAsync(async () => {
      await elbV2.deleteRule({ input: {} });
    });

    assertInstanceOf(noDeleteArn, SimElbV2ValidationError);

    const unknown = await assertThrowsErrorAsync(async () => {
      await elbV2.deleteRule(new DeleteRuleCommand({ RuleArn: "arn:missing" }));
    });

    assertInstanceOf(unknown, SimElbV2RuleNotFoundException);

    // Then each is refused.
    assertStringIncludes(noModifyArn.message, "RuleArn is required");
    assertStringIncludes(noDeleteArn.message, "RuleArn is required");
    assertStringIncludes(unknown.message, "arn:missing");
  });

  it("refuses a rule with no listener named", async () => {
    // Given simulated ELBv2.
    const { elbV2 } = await makeListener();

    // When a rule is written without a listener.
    const error = await assertThrowsErrorAsync(async () => {
      await elbV2.createRule({ input: {} });
    });

    assertInstanceOf(error, SimElbV2ValidationError);

    // Then it is refused.
    assertStringIncludes(error.message, "ListenerArn is required");
  });
});

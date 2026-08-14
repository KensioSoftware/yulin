import {
  DescribeRulesCommand,
  SetRulePrioritiesCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimElbV2PriorityInUseException,
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
  const elbV2 = simAws.elbV2();
  const loadBalancerArn = await createFixtureLoadBalancer(elbV2);
  const targetGroupArn = await createFixtureLambdaTargetGroup(elbV2);
  const listenerArn = await createFixtureListener(
    elbV2,
    loadBalancerArn,
    targetGroupArn,
  );

  return { elbV2, listenerArn, targetGroupArn };
}

describe("ELBv2 SetRulePrioritiesCommand", () => {
  it("swaps two rules over in one SetRulePriorities request", async () => {
    // Given two rules at priorities 10 and 20.
    const { elbV2, listenerArn, targetGroupArn } = await makeListener();
    const first = await createFixtureRule(
      elbV2,
      listenerArn,
      10,
      targetGroupArn,
      "a.test",
    );
    const second = await createFixtureRule(
      elbV2,
      listenerArn,
      20,
      targetGroupArn,
      "b.test",
    );

    // When they are swapped.
    const output = await elbV2.setRulePriorities(
      new SetRulePrioritiesCommand({
        RulePriorities: [
          { RuleArn: first, Priority: 20 },
          { RuleArn: second, Priority: 10 },
        ],
      }),
    );

    // Then the swap is allowed, because the order it leaves behind is valid.
    assertArrayLength(output.Rules, 2);
    assertIdentical(output.Rules[0].Priority, "20");
    assertIdentical(output.Rules[1].Priority, "10");
  });

  it("refuses priorities that would leave two rules sharing one", async () => {
    // Given two rules at priorities 10 and 20.
    const { elbV2, listenerArn, targetGroupArn } = await makeListener();
    const first = await createFixtureRule(
      elbV2,
      listenerArn,
      10,
      targetGroupArn,
      "a.test",
    );
    const second = await createFixtureRule(
      elbV2,
      listenerArn,
      20,
      targetGroupArn,
      "b.test",
    );

    // When one is moved onto the other, and then one is named twice.
    const clash = await assertThrowsErrorAsync(async () => {
      await elbV2.setRulePriorities(
        new SetRulePrioritiesCommand({
          RulePriorities: [{ RuleArn: first, Priority: 20 }],
        }),
      );
    });

    assertInstanceOf(clash, SimElbV2PriorityInUseException);

    const repeated = await assertThrowsErrorAsync(async () => {
      await elbV2.setRulePriorities(
        new SetRulePrioritiesCommand({
          RulePriorities: [
            { RuleArn: second, Priority: 30 },
            { RuleArn: second, Priority: 40 },
          ],
        }),
      );
    });

    assertInstanceOf(repeated, SimElbV2ValidationError);

    // Then both are refused, and nothing moved.
    assertStringIncludes(clash.message, "sharing one");
    assertStringIncludes(repeated.message, "more than once");

    const unchanged = await elbV2.describeRules(
      new DescribeRulesCommand({ RuleArns: [first, second] }),
    );
    assertArrayLength(unchanged.Rules, 2);
    assertIdentical(unchanged.Rules[0].Priority, "10");
    assertIdentical(unchanged.Rules[1].Priority, "20");
  });

  it("refuses a SetRulePriorities request naming nothing usable", async () => {
    // Given a listener with a rule.
    const { elbV2, listenerArn, targetGroupArn } = await makeListener();
    await createFixtureRule(elbV2, listenerArn, 10, targetGroupArn);

    // When the request is empty, or a pair names no rule.
    const empty = await assertThrowsErrorAsync(async () => {
      await elbV2.setRulePriorities({ input: {} });
    });

    assertInstanceOf(empty, SimElbV2ValidationError);

    const noRuleArn = await assertThrowsErrorAsync(async () => {
      await elbV2.setRulePriorities(
        new SetRulePrioritiesCommand({ RulePriorities: [{ Priority: 5 }] }),
      );
    });

    assertInstanceOf(noRuleArn, SimElbV2ValidationError);

    // Then both are refused.
    assertStringIncludes(empty.message, "at least one rule");
    assertStringIncludes(noRuleArn.message, "requires a RuleArn");
  });
});

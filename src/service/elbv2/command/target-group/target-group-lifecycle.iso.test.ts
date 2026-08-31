import {
  DeleteLoadBalancerCommand,
  DeleteTargetGroupCommand,
  DescribeTargetGroupsCommand,
  ModifyTargetGroupCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimElbV2ResourceInUseException,
  SimElbV2TargetGroupNotFoundException,
  SimElbV2ValidationError,
} from "../../error/sim-elbv2.error.js";
import {
  createFixtureIpTargetGroup,
  createFixtureLambdaTargetGroup,
  createFixtureListener,
  createFixtureLoadBalancer,
} from "../../sim-elbv2.fixture.js";

describe("ELBv2 target group lifecycle", () => {
  it("describes target groups by ARN, by name and by load balancer", async () => {
    // Given a load balancer forwarding to one of two target groups.
    const simAws = new SimAws();
    const elbV2 = simAws.elbV2();
    const loadBalancerArn = await createFixtureLoadBalancer(elbV2);
    const forwardedTo = await createFixtureLambdaTargetGroup(elbV2);
    const idle = await createFixtureIpTargetGroup(elbV2);

    await createFixtureListener(elbV2, loadBalancerArn, forwardedTo);

    // When they are described each way.
    const all = await elbV2.describeTargetGroups({ input: {} });
    const byArn = await elbV2.describeTargetGroups(
      new DescribeTargetGroupsCommand({ TargetGroupArns: [idle] }),
    );
    const byName = await elbV2.describeTargetGroups(
      new DescribeTargetGroupsCommand({ Names: ["checkout-tg"] }),
    );
    const byLoadBalancer = await elbV2.describeTargetGroups(
      new DescribeTargetGroupsCommand({ LoadBalancerArn: loadBalancerArn }),
    );

    // Then the one being forwarded to knows which load balancer reaches it.
    assertArrayLength(all.TargetGroups, 2);
    assertArrayLength(byArn.TargetGroups, 1);
    assertIdentical(byArn.TargetGroups[0].TargetGroupArn, idle);
    assertArrayLength(byName.TargetGroups, 1);
    assertArrayLength(byLoadBalancer.TargetGroups, 1);
    assertIdentical(byLoadBalancer.TargetGroups[0].TargetGroupArn, forwardedTo);
    assertIdentical(
      byName.TargetGroups[0].LoadBalancerArns[0],
      loadBalancerArn,
    );
  });

  it("refuses a describe naming target groups more than one way", async () => {
    // Given simulated ELBv2.
    const simAws = new SimAws();
    const elbV2 = simAws.elbV2();

    // When a describe carries both names and ARNs.
    const error = await assertThrowsErrorAsync(async () => {
      await elbV2.describeTargetGroups(
        new DescribeTargetGroupsCommand({
          Names: ["web-tg"],
          TargetGroupArns: ["arn:one"],
        }),
      );
    });

    assertInstanceOf(error, SimElbV2ValidationError);

    // Then it is refused.
    assertStringIncludes(error.message, "takes one of");
  });

  it("refuses a target group that does not exist, or a name it never had", async () => {
    // Given simulated ELBv2 with one target group.
    const simAws = new SimAws();
    const elbV2 = simAws.elbV2();
    await createFixtureIpTargetGroup(elbV2);

    // When another name is described, and one is created with no name.
    const unknownName = await assertThrowsErrorAsync(async () => {
      await elbV2.describeTargetGroups(
        new DescribeTargetGroupsCommand({ Names: ["missing-tg"] }),
      );
    });

    assertInstanceOf(unknownName, SimElbV2TargetGroupNotFoundException);

    const noName = await assertThrowsErrorAsync(async () => {
      await elbV2.createTargetGroup({ input: { TargetType: "lambda" } });
    });

    assertInstanceOf(noName, SimElbV2ValidationError);

    // Then both are refused.
    assertStringIncludes(unknownName.message, "missing-tg");
    assertStringIncludes(noName.message, "Name is required");
  });

  it("changes only the health check settings a modify names", async () => {
    // Given an ip target group with the default health check settings.
    const simAws = new SimAws();
    const elbV2 = simAws.elbV2();
    const targetGroupArn = await createFixtureIpTargetGroup(elbV2);

    // When only the path is changed.
    const output = await elbV2.modifyTargetGroup(
      new ModifyTargetGroupCommand({
        TargetGroupArn: targetGroupArn,
        HealthCheckPath: "/ready",
        Matcher: { HttpCode: "200-299" },
      }),
    );

    // Then the rest is left as it was.
    const targetGroup = output.TargetGroups?.[0];
    assertNonNullable(targetGroup);
    assertIdentical(targetGroup.HealthCheckPath, "/ready");
    assertIdentical(targetGroup.Matcher?.HttpCode, "200-299");
    assertIdentical(targetGroup.HealthCheckIntervalSeconds, 30);
    assertIdentical(targetGroup.HealthyThresholdCount, 5);
  });

  it("refuses a modify naming no target group, or one that is gone", async () => {
    // Given simulated ELBv2.
    const simAws = new SimAws();
    const elbV2 = simAws.elbV2();

    // When a modify carries no ARN, and then an unknown one.
    const missing = await assertThrowsErrorAsync(async () => {
      await elbV2.modifyTargetGroup({ input: {} });
    });

    assertInstanceOf(missing, SimElbV2ValidationError);

    const unknown = await assertThrowsErrorAsync(async () => {
      await elbV2.modifyTargetGroup(
        new ModifyTargetGroupCommand({ TargetGroupArn: "arn:missing" }),
      );
    });

    assertInstanceOf(unknown, SimElbV2TargetGroupNotFoundException);

    // Then both are refused.
    assertStringIncludes(missing.message, "TargetGroupArn is required");
    assertStringIncludes(unknown.message, "arn:missing");
  });

  it("refuses to delete a target group a listener still forwards to", async () => {
    // Given a listener forwarding to a target group.
    const simAws = new SimAws();
    const elbV2 = simAws.elbV2();
    const loadBalancerArn = await createFixtureLoadBalancer(elbV2);
    const targetGroupArn = await createFixtureLambdaTargetGroup(elbV2);

    await createFixtureListener(elbV2, loadBalancerArn, targetGroupArn);

    // When the target group is deleted.
    const error = await assertThrowsErrorAsync(async () => {
      await elbV2.deleteTargetGroup(
        new DeleteTargetGroupCommand({ TargetGroupArn: targetGroupArn }),
      );
    });

    assertInstanceOf(error, SimElbV2ResourceInUseException);

    // Then it is refused while anything still forwards to it.
    assertStringIncludes(error.message, "still forwarded to by");
  });

  it("leaves target groups behind when their load balancer is deleted", async () => {
    // Given a listener forwarding to a target group.
    const simAws = new SimAws();
    const elbV2 = simAws.elbV2();
    const loadBalancerArn = await createFixtureLoadBalancer(elbV2);
    const targetGroupArn = await createFixtureLambdaTargetGroup(elbV2);

    await createFixtureListener(elbV2, loadBalancerArn, targetGroupArn);

    // When the load balancer is deleted and then the target group.
    await elbV2.deleteLoadBalancer(
      new DeleteLoadBalancerCommand({ LoadBalancerArn: loadBalancerArn }),
    );

    const surviving = await elbV2.describeTargetGroups({ input: {} });

    await elbV2.deleteTargetGroup(
      new DeleteTargetGroupCommand({ TargetGroupArn: targetGroupArn }),
    );

    // Then the group survived the load balancer and is deletable afterwards.
    assertArrayLength(surviving.TargetGroups, 1);
    assertArrayEmpty(surviving.TargetGroups[0].LoadBalancerArns);

    const remaining = await elbV2.describeTargetGroups({ input: {} });
    assertArrayEmpty(remaining.TargetGroups);
  });

  it("refuses a delete naming no target group, or one that is gone", async () => {
    // Given simulated ELBv2.
    const simAws = new SimAws();
    const elbV2 = simAws.elbV2();

    // When a delete carries no ARN, and then an unknown one.
    const missing = await assertThrowsErrorAsync(async () => {
      await elbV2.deleteTargetGroup({ input: {} });
    });

    assertInstanceOf(missing, SimElbV2ValidationError);

    const unknown = await assertThrowsErrorAsync(async () => {
      await elbV2.deleteTargetGroup(
        new DeleteTargetGroupCommand({ TargetGroupArn: "arn:missing" }),
      );
    });

    assertInstanceOf(unknown, SimElbV2TargetGroupNotFoundException);

    // Then both are refused.
    assertStringIncludes(missing.message, "TargetGroupArn is required");
    assertStringIncludes(unknown.message, "arn:missing");
  });
});

import {
  DeleteLoadBalancerCommand,
  DeleteTargetGroupCommand,
  DeregisterTargetsCommand,
  DescribeLoadBalancersCommand,
  DescribeTargetGroupAttributesCommand,
  DescribeTargetGroupsCommand,
  DescribeTargetHealthCommand,
  ElasticLoadBalancingV2Client,
  ModifyTargetGroupCommand,
  RegisterTargetsCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import {
  assertArrayIncludes,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { afterAll, beforeAll, describe, it } from "vitest";

import {
  servedLoadBalancer,
  servedTargetGroup,
} from "../../../../../test/elbv2/served-elbv2-api.js";
import { servedUserCredentials } from "../../../../../test/serve/served-credentials.js";
import { SimAwsLocalServer } from "../../../../serve/index.js";
import { SimAws } from "../../../aws/sim-aws.js";

/**
 * Simulated ELBv2 reached over a port by a real client, which is the shape a
 * container provisioning its own routing has.
 *
 * ELB speaks the Query protocol, and its requests nest further than any other
 * service that does. A health check matcher, a forward configuration and a
 * rule condition all arrive flattened into one form encoding. What these cover
 * is whether a request survives that and comes back out the same shape.
 */
describe("Serving simulated ELBv2 on an endpoint URL", () => {
  const simAws = new SimAws();
  const srv = new SimAwsLocalServer({ simAws });

  let client: ElasticLoadBalancingV2Client;

  beforeAll(async () => {
    await srv.listen();

    client = new ElasticLoadBalancingV2Client({
      region: simAws.defaultRegionName,
      endpoint: `http://localhost:${srv.port}`,
      credentials: await servedUserCredentials(simAws, "Operator"),
    });
  });

  afterAll(async () => {
    await srv.close();
  });

  it("makes a load balancer, describes it and takes it away", async () => {
    // Given a load balancer created over the endpoint
    const loadBalancerArn = await servedLoadBalancer(client, "shop-alb");

    // When it is described by name
    const described = await client.send(
      new DescribeLoadBalancersCommand({ Names: ["shop-alb"], PageSize: 10 }),
    );

    // Then the nested state and the timestamp arrived as what they are
    const [loadBalancer] = described.LoadBalancers ?? [];
    assertNonNullable(loadBalancer, "the load balancer just created");
    assertIdentical(loadBalancer.LoadBalancerArn, loadBalancerArn);
    assertIdentical(loadBalancer.State?.Code, "active");
    assertIdentical(loadBalancer.Type, "application");
    assertStringIncludes(loadBalancer.DNSName ?? "", "shop-alb");
    assertNonNullable(loadBalancer.CreatedTime, "a creation time");

    // And deleting it over the endpoint leaves nothing to describe
    await client.send(
      new DeleteLoadBalancerCommand({ LoadBalancerArn: loadBalancerArn }),
    );

    const error = await assertThrowsErrorAsync(
      async () =>
        await client.send(
          new DescribeLoadBalancersCommand({
            LoadBalancerArns: [loadBalancerArn],
          }),
        ),
    );
    assertIdentical(error.name, "LoadBalancerNotFoundException");
  });

  it("makes a target group, changes its health check and deletes it", async () => {
    // Given a target group created over the endpoint with a health check
    const targetGroupArn = await servedTargetGroup(client, "orders-tg");

    // When it is described and its health check is changed
    const described = await client.send(
      new DescribeTargetGroupsCommand({ Names: ["orders-tg"] }),
    );
    const changed = await client.send(
      new ModifyTargetGroupCommand({
        TargetGroupArn: targetGroupArn,
        HealthCheckPath: "/ready",
        HealthCheckTimeoutSeconds: 4,
        UnhealthyThresholdCount: 4,
        Matcher: { HttpCode: "200" },
      }),
    );

    // Then the settings survived as the numbers and the nested matcher they are
    const [targetGroup] = described.TargetGroups ?? [];
    assertNonNullable(targetGroup, "the target group just created");
    assertIdentical(targetGroup.Port, 8080);
    assertIdentical(targetGroup.HealthCheckIntervalSeconds, 15);
    assertIdentical(targetGroup.HealthyThresholdCount, 3);
    assertIdentical(targetGroup.Matcher?.HttpCode, "200-299");
    assertTrue(targetGroup.HealthCheckEnabled ?? false);

    const [modified] = changed.TargetGroups ?? [];
    assertNonNullable(modified, "the changed target group");
    assertIdentical(modified.HealthCheckPath, "/ready");
    assertIdentical(modified.HealthCheckTimeoutSeconds, 4);
    assertIdentical(modified.UnhealthyThresholdCount, 4);
    assertIdentical(modified.Matcher?.HttpCode, "200");

    // And it can be deleted over the same endpoint
    await client.send(
      new DeleteTargetGroupCommand({ TargetGroupArn: targetGroupArn }),
    );

    const error = await assertThrowsErrorAsync(
      async () =>
        await client.send(
          new DescribeTargetGroupsCommand({
            TargetGroupArns: [targetGroupArn],
          }),
        ),
    );
    assertIdentical(error.name, "TargetGroupNotFoundException");
  });

  it("registers targets, reports their health and deregisters them", async () => {
    // Given a target group with two addresses registered over the endpoint
    const targetGroupArn = await servedTargetGroup(client, "web-tg");

    await client.send(
      new RegisterTargetsCommand({
        TargetGroupArn: targetGroupArn,
        Targets: [
          { Id: "10.0.0.1", Port: 8080 },
          { Id: "10.0.0.2", Port: 8081 },
        ],
      }),
    );

    // When their health is asked about
    const health = await client.send(
      new DescribeTargetHealthCommand({ TargetGroupArn: targetGroupArn }),
    );

    // Then both are reported, each on the port it was registered on
    const described = health.TargetHealthDescriptions ?? [];
    assertArrayLength(described, 2);
    assertArrayIncludes(
      described.map((each) => each.Target?.Id),
      "10.0.0.1",
    );

    const [first] = described;
    assertNonNullable(first, "the first target");
    assertIdentical(first.TargetHealth?.State, "healthy");
    assertIdentical(first.Target?.Port, 8080);

    // And deregistering one leaves the other
    await client.send(
      new DeregisterTargetsCommand({
        TargetGroupArn: targetGroupArn,
        Targets: [{ Id: "10.0.0.1", Port: 8080 }],
      }),
    );

    const asked = await client.send(
      new DescribeTargetHealthCommand({
        TargetGroupArn: targetGroupArn,
        Targets: [{ Id: "10.0.0.2", Port: 8081 }],
      }),
    );
    assertArrayLength(asked.TargetHealthDescriptions ?? [], 1);

    const remaining = await client.send(
      new DescribeTargetHealthCommand({ TargetGroupArn: targetGroupArn }),
    );
    const [left] = remaining.TargetHealthDescriptions ?? [];
    assertArrayLength(remaining.TargetHealthDescriptions ?? [], 1);
    assertNonNullable(left, "the target that was not deregistered");
    assertIdentical(left.Target?.Id, "10.0.0.2");
    assertIdentical(left.Target.Port, 8081);
  });

  it("refuses an ELBv2 operation it does not serve", async () => {
    // When an operation simulated ELBv2 has no answer for is asked for
    const error = await assertThrowsErrorAsync(
      async () =>
        await client.send(
          new DescribeTargetGroupAttributesCommand({
            TargetGroupArn: "arn:aws:elasticloadbalancing:::targetgroup/none",
          }),
        ),
    );

    // Then it is refused by name, in the shape the Query protocol states an
    // error, so an SDK raises it rather than failing to parse the response
    assertIdentical(error.name, "NotImplemented");
    assertStringIncludes(error.message, "DescribeTargetGroupAttributes");
  });
});

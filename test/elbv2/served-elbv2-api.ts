import {
  CreateListenerCommand,
  CreateLoadBalancerCommand,
  CreateTargetGroupCommand,
  type ElasticLoadBalancingV2Client,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import { assertNonNullable } from "@kensio/smartass";

/**
 * The load balancer, target group and listener a served ELBv2 test builds
 * before it can say anything about routing.
 *
 * These go through the endpoint rather than through `SimAws`, because what is
 * being tested is the endpoint. They live under `test/` for the same reasons as
 * `test/sns/topic-fixture.ts`.
 */

/**
 * Make a load balancer over the endpoint, answering with its ARN.
 */
export async function servedLoadBalancer(
  client: ElasticLoadBalancingV2Client,
  name: string,
): Promise<string> {
  const created = await client.send(
    new CreateLoadBalancerCommand({
      Name: name,
      Scheme: "internet-facing",
      Subnets: ["subnet-1", "subnet-2"],
      SubnetMappings: [{ SubnetId: "subnet-1", AllocationId: "eipalloc-1" }],
      SecurityGroups: ["sg-1"],
      Tags: [{ Key: "team", Value: "shop" }],
    }),
  );

  const arn = created.LoadBalancers?.[0]?.LoadBalancerArn;
  assertNonNullable(arn, "CreateLoadBalancer answered with an ARN");

  return arn;
}

/**
 * Make a target group holding addresses, answering with its ARN.
 */
export async function servedTargetGroup(
  client: ElasticLoadBalancingV2Client,
  name: string,
): Promise<string> {
  const created = await client.send(
    new CreateTargetGroupCommand({
      Name: name,
      TargetType: "ip",
      Protocol: "HTTP",
      Port: 8080,
      VpcId: "vpc-1",
      HealthCheckEnabled: true,
      HealthCheckPath: "/health",
      HealthCheckIntervalSeconds: 15,
      HealthyThresholdCount: 3,
      Matcher: { HttpCode: "200-299" },
    }),
  );

  const arn = created.TargetGroups?.[0]?.TargetGroupArn;
  assertNonNullable(arn, "CreateTargetGroup answered with an ARN");

  return arn;
}

/**
 * Make a listener forwarding to a target group, answering with its ARN.
 */
export async function servedListener(
  client: ElasticLoadBalancingV2Client,
  loadBalancerArn: string,
  targetGroupArn: string,
): Promise<string> {
  const created = await client.send(
    new CreateListenerCommand({
      LoadBalancerArn: loadBalancerArn,
      Protocol: "HTTP",
      Port: 80,
      DefaultActions: [
        {
          Type: "forward",
          Order: 1,
          ForwardConfig: {
            TargetGroups: [{ TargetGroupArn: targetGroupArn, Weight: 1 }],
          },
        },
      ],
    }),
  );

  const arn = created.Listeners?.[0]?.ListenerArn;
  assertNonNullable(arn, "CreateListener answered with an ARN");

  return arn;
}

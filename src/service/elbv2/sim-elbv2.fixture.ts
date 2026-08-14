import { assertArrayLength } from "@kensio/smartass";

import type { SimElbV2 } from "./sim-elbv2.js";

/**
 * Test support for building a simulated ELBv2 stack.
 *
 * Almost every behaviour worth testing here needs a load balancer, a target
 * group and a listener before it can be reached, so building those is done
 * once here rather than at the top of every test.
 *
 * These helpers drive the simulator through structural command shapes rather
 * than real SDK command objects, because this is source rather than a test
 * file. The colocated tests cover SDK-shaped input.
 */

/**
 * A Lambda function ARN a `lambda` target group will take.
 */
export const fixtureFunctionArn =
  "arn:aws:lambda:eu-west-1:888888888888:function:checkout";

/**
 * Create a load balancer and answer with its ARN.
 */
export async function createFixtureLoadBalancer(
  elbV2: SimElbV2,
  name = "shop-alb",
): Promise<string> {
  const output = await elbV2.createLoadBalancer({ input: { Name: name } });

  assertArrayLength(output.LoadBalancers, 1);

  return output.LoadBalancers[0].LoadBalancerArn;
}

/**
 * Create an empty target group of the `lambda` type and answer with its ARN.
 *
 * Nothing is registered in it: a test that wants a function in it registers
 * `fixtureFunctionArn` itself, since that is usually the thing being tested.
 */
export async function createFixtureLambdaTargetGroup(
  elbV2: SimElbV2,
  name = "checkout-tg",
): Promise<string> {
  const output = await elbV2.createTargetGroup({
    input: { Name: name, TargetType: "lambda" },
  });

  assertArrayLength(output.TargetGroups, 1);

  return output.TargetGroups[0].TargetGroupArn;
}

/**
 * Create an empty target group of the `ip` type and answer with its ARN.
 */
export async function createFixtureIpTargetGroup(
  elbV2: SimElbV2,
  name = "web-tg",
): Promise<string> {
  const output = await elbV2.createTargetGroup({
    input: { Name: name, TargetType: "ip", Protocol: "HTTP", Port: 8080 },
  });

  assertArrayLength(output.TargetGroups, 1);

  return output.TargetGroups[0].TargetGroupArn;
}

/**
 * Create an HTTP listener forwarding to a target group, and answer with its
 * ARN.
 */
export async function createFixtureListener(
  elbV2: SimElbV2,
  loadBalancerArn: string,
  targetGroupArn: string,
  port = 80,
): Promise<string> {
  const output = await elbV2.createListener({
    input: {
      LoadBalancerArn: loadBalancerArn,
      Protocol: "HTTP",
      Port: port,
      DefaultActions: [{ Type: "forward", TargetGroupArn: targetGroupArn }],
    },
  });

  assertArrayLength(output.Listeners, 1);

  return output.Listeners[0].ListenerArn;
}

/**
 * Create a rule on a listener, and answer with its ARN.
 */
export async function createFixtureRule(
  elbV2: SimElbV2,
  listenerArn: string,
  priority: number,
  targetGroupArn: string,
  hostHeader = "shop.example.com",
): Promise<string> {
  const output = await elbV2.createRule({
    input: {
      ListenerArn: listenerArn,
      Priority: priority,
      Conditions: [{ Field: "host-header", Values: [hostHeader] }],
      Actions: [{ Type: "forward", TargetGroupArn: targetGroupArn }],
    },
  });

  assertArrayLength(output.Rules, 1);

  return output.Rules[0].RuleArn;
}

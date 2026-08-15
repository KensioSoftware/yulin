import { assertDefined } from "../../util/type-guard/defined.js";
import type { SimAcm } from "../acm/sim-acm.js";
import type { SimAws } from "../aws/sim-aws.js";
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

  const arn = output.LoadBalancers?.[0]?.LoadBalancerArn;
  assertDefined(arn, `Sim ELBv2 created no load balancer named ${name}`);

  return arn;
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

  const arn = output.TargetGroups?.[0]?.TargetGroupArn;
  assertDefined(arn, `Sim ELBv2 created no target group named ${name}`);

  return arn;
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

  const arn = output.TargetGroups?.[0]?.TargetGroupArn;
  assertDefined(arn, `Sim ELBv2 created no target group named ${name}`);

  return arn;
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

  const arn = output.Listeners?.[0]?.ListenerArn;
  assertDefined(arn, `Sim ELBv2 created no listener on port ${String(port)}`);

  return arn;
}

/**
 * Request a certificate from simulated ACM and answer with its ARN once it is
 * issued.
 *
 * A certificate whose domain no hosted zone covers issues on its own, so this
 * is an issued certificate: a test wanting one still pending validation asks
 * ACM to require it instead.
 */
export async function createFixtureCertificate(
  simAws: SimAws,
  acm: SimAcm = simAws.acm(),
  domainName = "shop.example.com",
): Promise<string> {
  const output = await acm.requestCertificate({
    input: { DomainName: domainName },
  });

  await simAws.backgroundTasksComplete();

  const arn = output.CertificateArn;
  assertDefined(arn, `Sim ACM issued no certificate for ${domainName}`);

  return arn;
}

/**
 * Create an HTTPS listener on port 443 with a certificate, and answer with its
 * ARN.
 */
export async function createFixtureHttpsListener(
  elbV2: SimElbV2,
  loadBalancerArn: string,
  targetGroupArn: string,
  certificateArn: string,
): Promise<string> {
  const output = await elbV2.createListener({
    input: {
      LoadBalancerArn: loadBalancerArn,
      Protocol: "HTTPS",
      Port: 443,
      Certificates: [{ CertificateArn: certificateArn }],
      DefaultActions: [{ Type: "forward", TargetGroupArn: targetGroupArn }],
    },
  });

  const arn = output.Listeners?.[0]?.ListenerArn;
  assertDefined(arn, "Sim ELBv2 created no HTTPS listener on port 443");

  return arn;
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

  const arn = output.Rules?.[0]?.RuleArn;
  assertDefined(
    arn,
    `Sim ELBv2 created no rule at priority ${String(priority)}`,
  );

  return arn;
}

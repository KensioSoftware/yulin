import { assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";

import { assertDefined } from "../../../util/type-guard/defined.js";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimElbV2RuleConditionInput } from "../command/rule/rule-condition.command.js";
import type { SimElbV2LoadBalancer } from "../load-balancer/sim-elbv2-load-balancer.js";
import type { SimElbV2 } from "../sim-elbv2.js";
import type { SimElbV2Result } from "./sim-elbv2-event.type.js";
import { simElbV2Fetch } from "./sim-elbv2-fetch.js";
import { simElbV2LambdaTargetFactory } from "./sim-elbv2-lambda-target.factory.js";
import { simElbV2ServingTargetGroupFactory } from "./sim-elbv2-serving-target-group.factory.js";

/**
 * A load balancer whose default action answers `checkout`.
 */
async function makeLoadBalancer(simAws: SimAws): Promise<SimElbV2LoadBalancer> {
  return await simElbV2LambdaTargetFactory.make({}, simAws);
}

/**
 * Add a rule sending a request to a target group answering with its own name.
 */
async function addRule(
  simAws: SimAws,
  loadBalancer: SimElbV2LoadBalancer,
  priority: number,
  name: string,
  conditions: readonly SimElbV2RuleConditionInput[],
): Promise<void> {
  const elbV2: SimElbV2 = simAws.elbV2();
  const targetGroup = await simElbV2ServingTargetGroupFactory.make(
    { name, handler: (): SimElbV2Result => ({ statusCode: 200, body: name }) },
    simAws,
  );
  const listener = elbV2.findListenerOnPort(loadBalancer.arn, 80);

  assertDefined(listener, `No listener on port 80 of ${loadBalancer.name}`);

  await elbV2.createRule({
    input: {
      ListenerArn: listener.arn,
      Priority: priority,
      Conditions: conditions,
      Actions: [{ Type: "forward", TargetGroupArn: targetGroup.arn }],
    },
  });
}

describe("Matching sim ELBv2 listener rules against a request", () => {
  it("sends a request to the target group its path pattern names", async () => {
    // Given a load balancer with a rule on a path prefix
    const simAws = new SimAws();
    const loadBalancer = await makeLoadBalancer(simAws);
    await addRule(simAws, loadBalancer, 10, "api", [
      { Field: "path-pattern", Values: ["/api/*"] },
    ]);

    // When a request arrives under that path
    const response = await simElbV2Fetch(
      simAws,
      `http://${loadBalancer.dnsName}/api/orders`,
    );

    // Then the rule claimed it rather than the listener's default action
    assertIdentical(await response.text(), "api");
  });

  it("falls through to the default action when no rule matches", async () => {
    // Given the same load balancer and rule
    const simAws = new SimAws();
    const loadBalancer = await makeLoadBalancer(simAws);
    await addRule(simAws, loadBalancer, 10, "api", [
      { Field: "path-pattern", Values: ["/api/*"] },
    ]);

    // When a request arrives at the prefix itself, which the pattern does not
    // cover, and at a path nothing mentions
    const bare = await simElbV2Fetch(
      simAws,
      `http://${loadBalancer.dnsName}/api`,
    );
    const elsewhere = await simElbV2Fetch(
      simAws,
      `http://${loadBalancer.dnsName}/orders`,
    );

    // Then both are answered by the default action, which is the listener's
    // own and the rule real ELB reports as `default`
    assertIdentical(await bare.text(), "checkout");
    assertIdentical(await elsewhere.text(), "checkout");
  });

  it("takes the first matching rule in priority order", async () => {
    // Given two rules that both match a request, the lower priority one last
    const simAws = new SimAws();
    const loadBalancer = await makeLoadBalancer(simAws);
    await addRule(simAws, loadBalancer, 20, "everything", [
      { Field: "path-pattern", Values: ["/*"] },
    ]);
    await addRule(simAws, loadBalancer, 10, "api", [
      { Field: "path-pattern", Values: ["/api/*"] },
    ]);

    // When a request both would claim arrives
    const response = await simElbV2Fetch(
      simAws,
      `http://${loadBalancer.dnsName}/api/orders`,
    );

    // Then the lowest priority number won, and the rule created first never
    // saw the request
    assertIdentical(await response.text(), "api");
  });

  it("takes the later rule once the earlier one stops matching", async () => {
    // Given the same two rules
    const simAws = new SimAws();
    const loadBalancer = await makeLoadBalancer(simAws);
    await addRule(simAws, loadBalancer, 20, "everything", [
      { Field: "path-pattern", Values: ["/*"] },
    ]);
    await addRule(simAws, loadBalancer, 10, "api", [
      { Field: "path-pattern", Values: ["/api/*"] },
    ]);

    // When a request only the second one claims arrives
    const response = await simElbV2Fetch(
      simAws,
      `http://${loadBalancer.dnsName}/orders`,
    );

    // Then evaluation carried on past the rule that did not match
    assertIdentical(await response.text(), "everything");
  });

  it("matches a host header rule against the Host header sent", async () => {
    // Given a rule on a wildcard subdomain
    const simAws = new SimAws();
    const loadBalancer = await makeLoadBalancer(simAws);
    await addRule(simAws, loadBalancer, 10, "admin", [
      { Field: "host-header", Values: ["*.internal.example.com"] },
    ]);

    // When requests naming a host under and beside that domain arrive
    const claimed = await simElbV2Fetch(
      simAws,
      `http://${loadBalancer.dnsName}/orders`,
      { headers: { host: "ops.internal.example.com:8080" } },
    );
    const missed = await simElbV2Fetch(
      simAws,
      `http://${loadBalancer.dnsName}/orders`,
      { headers: { host: "internal.example.com" } },
    );

    // Then the Host header decided it, with the port left out of the
    // comparison, and the bare domain fell through
    assertIdentical(await claimed.text(), "admin");
    assertIdentical(await missed.text(), "checkout");
  });

  it("claims a request only when every condition on a rule holds", async () => {
    // Given a rule carrying a host header and a path pattern
    const simAws = new SimAws();
    const loadBalancer = await makeLoadBalancer(simAws);
    await addRule(simAws, loadBalancer, 10, "admin", [
      { Field: "host-header", Values: ["admin.example.com"] },
      { Field: "path-pattern", Values: ["/api/*"] },
    ]);

    // When requests satisfying both, and each on its own, arrive
    const both = await simElbV2Fetch(
      simAws,
      `http://${loadBalancer.dnsName}/api/orders`,
      { headers: { host: "admin.example.com" } },
    );
    const hostOnly = await simElbV2Fetch(
      simAws,
      `http://${loadBalancer.dnsName}/orders`,
      { headers: { host: "admin.example.com" } },
    );
    const pathOnly = await simElbV2Fetch(
      simAws,
      `http://${loadBalancer.dnsName}/api/orders`,
    );

    // Then several conditions on one rule are an and
    assertIdentical(await both.text(), "admin");
    assertIdentical(await hostOnly.text(), "checkout");
    assertIdentical(await pathOnly.text(), "checkout");
  });

  it("matches a path pattern against the path and not the query string", async () => {
    // Given a rule on a path
    const simAws = new SimAws();
    const loadBalancer = await makeLoadBalancer(simAws);
    await addRule(simAws, loadBalancer, 10, "reports", [
      { Field: "path-pattern", Values: ["/reports"] },
    ]);

    // When a request carrying a query string arrives at that path
    const response = await simElbV2Fetch(
      simAws,
      `http://${loadBalancer.dnsName}/reports?from=2026-01-01`,
    );

    // Then the query string was not part of the comparison, which is what the
    // query-string condition would be for
    assertIdentical(await response.text(), "reports");
  });

  it("stops matching a rule that has been deleted", async () => {
    // Given a load balancer whose rule is then deleted
    const simAws = new SimAws();
    const loadBalancer = await makeLoadBalancer(simAws);
    await addRule(simAws, loadBalancer, 10, "api", [
      { Field: "path-pattern", Values: ["/api/*"] },
    ]);

    const elbV2 = simAws.elbV2();
    const listener = elbV2.findListenerOnPort(loadBalancer.arn, 80);
    assertDefined(listener, "No listener on port 80");

    const rules = elbV2.findRulesForListener(listener.arn);
    await elbV2.deleteRule({ input: { RuleArn: rules[0]?.arn } });

    // When the request it claimed arrives again
    const response = await simElbV2Fetch(
      simAws,
      `http://${loadBalancer.dnsName}/api/orders`,
    );

    // Then it falls through to the default action
    assertIdentical(await response.text(), "checkout");
  });
});

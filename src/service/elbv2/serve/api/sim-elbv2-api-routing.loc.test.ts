import {
  AddListenerCertificatesCommand,
  CreateListenerCommand,
  CreateRuleCommand,
  DeleteListenerCommand,
  DeleteRuleCommand,
  DescribeListenerCertificatesCommand,
  DescribeListenersCommand,
  DescribeRulesCommand,
  ElasticLoadBalancingV2Client,
  ModifyListenerCommand,
  ModifyRuleCommand,
  RemoveListenerCertificatesCommand,
  type RuleCondition,
  SetRulePrioritiesCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import {
  assertArrayEmpty,
  assertArrayIncludes,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertTrue,
} from "@kensio/smartass";
import { afterAll, beforeAll, describe, it } from "vitest";

import {
  servedListener,
  servedLoadBalancer,
  servedTargetGroup,
} from "../../../../../test/elbv2/served-elbv2-api.js";
import { servedUserCredentials } from "../../../../../test/serve/served-credentials.js";
import { SimAwsLocalServer } from "../../../../serve/index.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { createFixtureCertificate } from "../../sim-elbv2.fixture.js";

/**
 * The listeners, certificates and rules of a simulated load balancer, reached
 * over a port by a real client.
 *
 * These are the deepest requests ELB takes. An action holds a forward
 * configuration holding a list of target groups, and a condition holds its
 * values in either of two forms. Query flattens all of it into one form
 * encoding, and these cover what comes back out.
 */
describe("Serving simulated ELBv2 routing on an endpoint URL", () => {
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

  it("makes a listener, changes what it answers with and removes it", async () => {
    // Given a listener forwarding to a target group, made over the endpoint
    const loadBalancerArn = await servedLoadBalancer(client, "checkout-alb");
    const targetGroupArn = await servedTargetGroup(client, "checkout-tg");
    const listenerArn = await servedListener(
      client,
      loadBalancerArn,
      targetGroupArn,
    );

    // When it is described and then changed to answer for itself
    const described = await client.send(
      new DescribeListenersCommand({ ListenerArns: [listenerArn] }),
    );
    const changed = await client.send(
      new ModifyListenerCommand({
        ListenerArn: listenerArn,
        DefaultActions: [
          {
            Type: "fixed-response",
            FixedResponseConfig: {
              StatusCode: "503",
              MessageBody: "closed for stocktaking",
              ContentType: "text/plain",
            },
          },
        ],
      }),
    );

    // Then the nested forward configuration came back the way it went out
    const [listener] = described.Listeners ?? [];
    assertNonNullable(listener, "the listener just created");
    assertIdentical(listener.Port, 80);
    assertIdentical(listener.Protocol, "HTTP");

    const [action] = listener.DefaultActions ?? [];
    assertNonNullable(action, "the listener's default action");
    assertIdentical(action.Type, "forward");
    assertIdentical(action.Order, 1);

    const [tuple] = action.ForwardConfig?.TargetGroups ?? [];
    assertNonNullable(tuple, "the forwarded target group");
    assertIdentical(tuple.TargetGroupArn, targetGroupArn);
    assertIdentical(tuple.Weight, 1);

    const [fixed] = changed.Listeners?.[0]?.DefaultActions ?? [];
    assertNonNullable(fixed, "the changed default action");
    assertIdentical(fixed.FixedResponseConfig?.StatusCode, "503");
    assertIdentical(
      fixed.FixedResponseConfig.MessageBody,
      "closed for stocktaking",
    );

    // And deleting it leaves the load balancer with none
    await client.send(new DeleteListenerCommand({ ListenerArn: listenerArn }));

    const left = await client.send(
      new DescribeListenersCommand({ LoadBalancerArn: loadBalancerArn }),
    );
    assertArrayEmpty(left.Listeners ?? []);
  });

  it("adds a certificate to an HTTPS listener and takes it off", async () => {
    // Given an HTTPS listener with one certificate, and another one issued
    const loadBalancerArn = await servedLoadBalancer(client, "secure-alb");
    const targetGroupArn = await servedTargetGroup(client, "secure-tg");
    const defaultCertificateArn = await createFixtureCertificate(simAws);
    const extraCertificateArn = await createFixtureCertificate(
      simAws,
      simAws.acm(),
      "checkout.example.com",
    );

    const created = await client.send(
      new CreateListenerCommand({
        LoadBalancerArn: loadBalancerArn,
        Protocol: "HTTPS",
        Port: 443,
        SslPolicy: "ELBSecurityPolicy-TLS13-1-2-2021-06",
        Certificates: [{ CertificateArn: defaultCertificateArn }],
        DefaultActions: [{ Type: "forward", TargetGroupArn: targetGroupArn }],
      }),
    );
    const [listener] = created.Listeners ?? [];
    assertNonNullable(listener, "the HTTPS listener just created");
    assertIdentical(listener.SslPolicy, "ELBSecurityPolicy-TLS13-1-2-2021-06");

    const listenerArn = listener.ListenerArn;
    assertNonNullable(listenerArn, "the listener's ARN");

    // When the second certificate is added over the endpoint
    const added = await client.send(
      new AddListenerCertificatesCommand({
        ListenerArn: listenerArn,
        Certificates: [{ CertificateArn: extraCertificateArn }],
      }),
    );

    // Then the listener answers for both, and the default says which it is
    assertArrayIncludes(
      (added.Certificates ?? []).map((each) => each.CertificateArn),
      extraCertificateArn,
    );

    const listed = await client.send(
      new DescribeListenerCertificatesCommand({
        ListenerArn: listenerArn,
        PageSize: 10,
      }),
    );
    const certificates = listed.Certificates ?? [];
    assertArrayLength(certificates, 2);
    assertIdentical(
      certificates.find((each) => each.IsDefault === true)?.CertificateArn,
      defaultCertificateArn,
    );

    // And removing the added one leaves the default behind
    await client.send(
      new RemoveListenerCertificatesCommand({
        ListenerArn: listenerArn,
        Certificates: [{ CertificateArn: extraCertificateArn }],
      }),
    );

    const remaining = await client.send(
      new DescribeListenerCertificatesCommand({ ListenerArn: listenerArn }),
    );
    const [left] = remaining.Certificates ?? [];
    assertArrayLength(remaining.Certificates ?? [], 1);
    assertNonNullable(left, "the certificate that was not removed");
    assertIdentical(left.CertificateArn, defaultCertificateArn);
    assertTrue(left.IsDefault ?? false);
  });

  it("writes rules on a listener in both condition forms", async () => {
    // Given a listener with two rules, each stating its values differently
    const listenerArn = await ruledListener(client, "rules-alb", "rules-tg");
    const hostRuleArn = await servedRule(client, listenerArn, 10, {
      Field: "host-header",
      Values: ["shop.example.com"],
    });
    const pathRuleArn = await servedRule(client, listenerArn, 20, {
      Field: "path-pattern",
      PathPatternConfig: { Values: ["/admin/*"] },
    });

    // When the listener's rules are described
    const described = await client.send(
      new DescribeRulesCommand({ ListenerArn: listenerArn, PageSize: 10 }),
    );
    const rules = described.Rules ?? [];

    // Then both forms came back the way they went out
    const hostRule = rules.find((each) => each.RuleArn === hostRuleArn);
    assertNonNullable(hostRule, "the host-header rule");
    assertIdentical(hostRule.Priority, "10");
    assertArrayIncludes(
      hostRule.Conditions?.[0]?.Values ?? [],
      "shop.example.com",
    );

    const pathRule = rules.find((each) => each.RuleArn === pathRuleArn);
    assertNonNullable(pathRule, "the path-pattern rule");
    assertArrayIncludes(
      pathRule.Conditions?.[0]?.PathPatternConfig?.Values ?? [],
      "/admin/*",
    );
    assertIdentical(pathRule.Actions?.[0]?.RedirectConfig?.Path, "/staff");
  });

  it("changes a rule, reorders it and deletes another", async () => {
    // Given two rules on a listener
    const listenerArn = await ruledListener(client, "orders-alb", "orders-tg");
    const firstRuleArn = await servedRule(client, listenerArn, 10, {
      Field: "host-header",
      Values: ["shop.example.com"],
    });
    const secondRuleArn = await servedRule(client, listenerArn, 20, {
      Field: "path-pattern",
      PathPatternConfig: { Values: ["/admin/*"] },
    });

    // When one is changed and moved, and the other is deleted
    const changed = await client.send(
      new ModifyRuleCommand({
        RuleArn: firstRuleArn,
        Conditions: [{ Field: "host-header", Values: ["orders.example.com"] }],
        Actions: [
          {
            Type: "redirect",
            RedirectConfig: { Path: "/orders", StatusCode: "HTTP_302" },
          },
        ],
      }),
    );
    const reordered = await client.send(
      new SetRulePrioritiesCommand({
        RulePriorities: [{ RuleArn: firstRuleArn, Priority: 30 }],
      }),
    );
    await client.send(new DeleteRuleCommand({ RuleArn: secondRuleArn }));

    // Then the listener is left with the one rule, as it was changed
    assertArrayIncludes(
      changed.Rules?.[0]?.Conditions?.[0]?.Values ?? [],
      "orders.example.com",
    );
    assertIdentical(reordered.Rules?.[0]?.Priority, "30");

    const left = await client.send(
      new DescribeRulesCommand({ RuleArns: [firstRuleArn] }),
    );
    assertArrayLength(left.Rules ?? [], 1);
  });
});

/**
 * A load balancer, target group and listener for rules to be written on.
 */
async function ruledListener(
  client: ElasticLoadBalancingV2Client,
  loadBalancerName: string,
  targetGroupName: string,
): Promise<string> {
  const loadBalancerArn = await servedLoadBalancer(client, loadBalancerName);
  const targetGroupArn = await servedTargetGroup(client, targetGroupName);

  return await servedListener(client, loadBalancerArn, targetGroupArn);
}

/**
 * Write one redirecting rule on a listener, answering with its ARN.
 */
async function servedRule(
  client: ElasticLoadBalancingV2Client,
  listenerArn: string,
  priority: number,
  condition: RuleCondition,
): Promise<string> {
  const created = await client.send(
    new CreateRuleCommand({
      ListenerArn: listenerArn,
      Priority: priority,
      Conditions: [condition],
      Actions: [
        {
          Type: "redirect",
          RedirectConfig: { Path: "/staff", StatusCode: "HTTP_301" },
        },
      ],
      Tags: [{ Key: "team", Value: "shop" }],
    }),
  );

  const arn = created.Rules?.[0]?.RuleArn;
  assertNonNullable(arn, "CreateRule answered with an ARN");

  return arn;
}

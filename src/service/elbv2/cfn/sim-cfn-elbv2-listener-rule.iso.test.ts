import { DescribeRulesCommand } from "@aws-sdk/client-elastic-load-balancing-v2";
import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { simElbV2Fetch } from "../serve/sim-elbv2-fetch.js";
import { simCfnElbV2Output } from "./sim-cfn-elbv2.fixture.js";

const notFound = {
  Type: "fixed-response",
  FixedResponseConfig: {
    StatusCode: "404",
    ContentType: "text/plain",
    MessageBody: "no such site",
  },
};

const orders = {
  Type: "fixed-response",
  FixedResponseConfig: {
    StatusCode: "200",
    ContentType: "text/plain",
    MessageBody: "orders",
  },
};

const routingResources = {
  ShopAlb: {
    Type: "AWS::ElasticLoadBalancingV2::LoadBalancer",
    Properties: { Name: "shop-alb" },
  },
  HttpListener: {
    Type: "AWS::ElasticLoadBalancingV2::Listener",
    Properties: {
      LoadBalancerArn: { Ref: "ShopAlb" },
      Protocol: "HTTP",
      Port: 80,
      DefaultActions: [notFound],
    },
  },
  OrdersRule: {
    Type: "AWS::ElasticLoadBalancingV2::ListenerRule",
    Properties: {
      ListenerArn: { Ref: "HttpListener" },
      Priority: 10,
      Conditions: [{ Field: "path-pattern", Values: ["/orders/*"] }],
      Actions: [orders],
    },
  },
};

const ruleTemplate = {
  Resources: routingResources,
  Outputs: {
    Arn: { Value: { Ref: "OrdersRule" } },
    AlsoArn: { Value: { "Fn::GetAtt": ["OrdersRule", "RuleArn"] } },
    IsDefault: { Value: { "Fn::GetAtt": ["OrdersRule", "IsDefault"] } },
    DnsName: { Value: { "Fn::GetAtt": ["ShopAlb", "DNSName"] } },
  },
};

describe("AWS::ElasticLoadBalancingV2::ListenerRule", () => {
  it("creates a rule on the listener the template names", async () => {
    // Given a template declaring a load balancer, a listener and a rule.
    const simAws = new SimAws();

    // When it is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "shop-stack",
      template: ruleTemplate,
    });

    await stack.waitForDeployComplete();

    // Then the rule sits on the listener, and Ref, RuleArn and IsDefault each
    // answer for it.
    const alb = simAws.elbV2().findLoadBalancerByName("shop-alb");
    assertNonNullable(alb);

    const listener = simAws.elbV2().findListenerOnPort(alb.arn, 80);
    assertNonNullable(listener);

    const rules = simAws.elbV2().findRulesForListener(listener.arn);
    assertArrayLength(rules, 1);

    assertIdentical(simCfnElbV2Output(stack, "Arn"), rules[0].arn);
    assertIdentical(simCfnElbV2Output(stack, "AlsoArn"), rules[0].arn);
    assertFalse(stack.outputs.get("IsDefault")?.value);

    await simAws.backgroundTasksComplete();
  });

  it("matches a request the way the same rule made through the SDK would", async () => {
    // Given a deployed load balancer whose rule claims one path prefix.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "shop-stack",
      template: ruleTemplate,
    });

    await stack.waitForDeployComplete();
    await simAws.backgroundTasksComplete();

    const dnsName = simCfnElbV2Output(stack, "DnsName");

    // When a request matching the rule arrives, and one that does not.
    const claimed = await simElbV2Fetch(simAws, `http://${dnsName}/orders/42`);
    const unclaimed = await simElbV2Fetch(simAws, `http://${dnsName}/other`);

    // Then the rule answers the first and the listener's default action the
    // second, which is what the same pair created through the SDK does.
    assertIdentical(claimed.status, 200);
    assertIdentical(await claimed.text(), "orders");
    assertIdentical(unclaimed.status, 404);
    assertIdentical(await unclaimed.text(), "no such site");
  });

  it("reports the conditions the template declared", async () => {
    // Given a deployed rule matching on a host header.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "shop-stack",
      template: {
        Resources: {
          ...routingResources,
          OrdersRule: {
            Type: "AWS::ElasticLoadBalancingV2::ListenerRule",
            Properties: {
              ListenerArn: { Ref: "HttpListener" },
              Priority: "20",
              Conditions: [
                {
                  Field: "host-header",
                  HostHeaderConfig: { Values: ["api.example.test"] },
                },
              ],
              Actions: [orders],
            },
          },
        },
        Outputs: { Arn: { Value: { Ref: "OrdersRule" } } },
      },
    });

    await stack.waitForDeployComplete();

    // When the rules are described.
    const alb = simAws.elbV2().findLoadBalancerByName("shop-alb");
    assertNonNullable(alb);

    const listener = simAws.elbV2().findListenerOnPort(alb.arn, 80);
    assertNonNullable(listener);

    const described = await simAws
      .elbV2()
      .describeRules(new DescribeRulesCommand({ ListenerArn: listener.arn }));

    // Then the rule reports the condition it was written with, and the
    // priority the template carried as a string reads as a number.
    assertArrayLength(described.Rules, 2);
    assertIdentical(described.Rules[0].Priority, "20");
    assertIdentical(described.Rules[0].Conditions[0]?.Field, "host-header");
    assertTrue(described.Rules[1].IsDefault);

    await simAws.backgroundTasksComplete();
  });

  it("refuses a condition field this simulation does not match on", async () => {
    // Given a rule matching on a query string, which nothing here reads.
    const simAws = new SimAws();

    // When it is deployed, then the deployment fails rather than leaving a
    // rule that looks configured and claims nothing.
    const error = await assertThrowsErrorAsync(async () => {
      return await simAws.cloudFormation().deployTemplate({
        stackName: "shop-stack",
        template: {
          Resources: {
            ...routingResources,
            OrdersRule: {
              Type: "AWS::ElasticLoadBalancingV2::ListenerRule",
              Properties: {
                ListenerArn: { Ref: "HttpListener" },
                Priority: 10,
                Conditions: [
                  {
                    Field: "query-string",
                    QueryStringConfig: { Values: [{ Key: "a", Value: "b" }] },
                  },
                ],
                Actions: [orders],
              },
            },
          },
        },
      });
    });

    assertStringIncludes(error.message, "query-string");

    await simAws.backgroundTasksComplete();
  });

  it("refuses two rules on one listener at the same priority", async () => {
    // Given two rules declaring the same priority, which leaves no defined
    // answer for a request both would claim.
    const simAws = new SimAws();

    // When it is deployed, then the deployment fails.
    const error = await assertThrowsErrorAsync(async () => {
      return await simAws.cloudFormation().deployTemplate({
        stackName: "shop-stack",
        template: {
          Resources: {
            ...routingResources,
            OtherRule: {
              Type: "AWS::ElasticLoadBalancingV2::ListenerRule",
              Properties: {
                ListenerArn: { Ref: "HttpListener" },
                Priority: 10,
                Conditions: [{ Field: "path-pattern", Values: ["/other/*"] }],
                Actions: [orders],
              },
            },
          },
        },
      });
    });

    assertStringIncludes(error.message, "10");

    await simAws.backgroundTasksComplete();
  });

  it("refuses a priority that is not a number", async () => {
    // Given a rule whose Priority is a word.
    const simAws = new SimAws();

    // When it is deployed, then the deployment fails naming the property.
    const error = await assertThrowsErrorAsync(async () => {
      return await simAws.cloudFormation().deployTemplate({
        stackName: "shop-stack",
        template: {
          Resources: {
            ...routingResources,
            OrdersRule: {
              Type: "AWS::ElasticLoadBalancingV2::ListenerRule",
              Properties: {
                ListenerArn: { Ref: "HttpListener" },
                Priority: "first",
                Conditions: [{ Field: "path-pattern", Values: ["/orders/*"] }],
                Actions: [orders],
              },
            },
          },
        },
      });
    });

    assertStringIncludes(error.message, "Priority is a number");

    await simAws.backgroundTasksComplete();
  });

  it("records a property a rule is created without", async () => {
    // Given a rule declaring something no AWS::ElasticLoadBalancingV2::
    // ListenerRule property covers.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "shop-stack",
      template: {
        Resources: {
          ...routingResources,
          OrdersRule: {
            Type: "AWS::ElasticLoadBalancingV2::ListenerRule",
            Properties: {
              ListenerArn: { Ref: "HttpListener" },
              Priority: 10,
              Conditions: [{ Field: "path-pattern", Values: ["/orders/*"] }],
              Actions: [orders],
              Tags: [{ Key: "Team", Value: "payments" }],
            },
          },
        },
      },
    });

    await stack.waitForDeployComplete();

    // Then it is created without it, and the record says so.
    const ignored = stack.getResource("OrdersRule")?.ignoredProperties;
    assertNonNullable(ignored);
    assertArrayLength(ignored, 1);
    assertStringIncludes(
      ignored[0].reason,
      "not a property simulated ELBv2 knows about",
    );

    await simAws.backgroundTasksComplete();
  });

  it("refuses an attribute a rule does not answer", async () => {
    // Given a template reading an attribute a rule has no answer for.
    const simAws = new SimAws();

    // When it is deployed, then the deployment fails naming the attribute.
    const error = await assertThrowsErrorAsync(async () => {
      return await simAws.cloudFormation().deployTemplate({
        stackName: "shop-stack",
        template: {
          Resources: routingResources,
          Outputs: {
            Nonsense: { Value: { "Fn::GetAtt": ["OrdersRule", "Priority"] } },
          },
        },
      });
    });

    assertStringIncludes(
      error.message,
      "Unsupported AWS::ElasticLoadBalancingV2::ListenerRule attribute " +
        "Priority",
    );

    await simAws.backgroundTasksComplete();
  });

  it("removes the rule when the stack is torn down", async () => {
    // Given a deployed rule.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "shop-stack",
      template: ruleTemplate,
    });

    await stack.waitForDeployComplete();

    // When the stack is deleted, then the whole routing setup has gone with
    // it, rules first.
    await stack.delete();
    await simAws.backgroundTasksComplete();

    assertUndefined(simAws.elbV2().findLoadBalancerByName("shop-alb"));
  });
});

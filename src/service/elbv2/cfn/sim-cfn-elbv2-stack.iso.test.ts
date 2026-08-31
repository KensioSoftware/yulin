import {
  assertIdentical,
  assertNonNullable,
  assertObjectMatches,
  assertResponseStatus,
  assertUndefined,
  describeResponse,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { simRoute53LocalName } from "../../route53/local-name/sim-route53-local-name.js";
import { simCfnElbV2Output } from "./sim-cfn-elbv2.fixture.js";
import type {
  SimElbV2Event,
  SimElbV2Result,
} from "../serve/sim-elbv2-event.type.js";
import { simElbV2Fetch } from "../serve/sim-elbv2-fetch.js";

/**
 * A whole routing setup as a stack declares one: a load balancer, a target
 * group holding a function, a listener forwarding to it, and a Route53 alias
 * pointing at the name `Fn::GetAtt DNSName` gave.
 */
const shopTemplate = {
  Resources: {
    CheckoutFunction: {
      Type: "AWS::Lambda::Function",
      Properties: {
        FunctionName: "checkout",
        Role: "arn:aws:iam::888888888888:role/CheckoutRole",
      },
    },
    ShopAlb: {
      Type: "AWS::ElasticLoadBalancingV2::LoadBalancer",
      Properties: { Name: "shop-alb", Subnets: ["subnet-1111"] },
    },
    CheckoutTargets: {
      Type: "AWS::ElasticLoadBalancingV2::TargetGroup",
      Properties: {
        Name: "checkout-tg",
        TargetType: "lambda",
        Targets: [{ Id: { "Fn::GetAtt": ["CheckoutFunction", "Arn"] } }],
      },
    },
    InvokePermission: {
      Type: "AWS::Lambda::Permission",
      Properties: {
        FunctionName: { Ref: "CheckoutFunction" },
        Action: "lambda:InvokeFunction",
        Principal: "elasticloadbalancing.amazonaws.com",
        SourceArn: { Ref: "CheckoutTargets" },
      },
    },
    HttpListener: {
      Type: "AWS::ElasticLoadBalancingV2::Listener",
      Properties: {
        LoadBalancerArn: { Ref: "ShopAlb" },
        Protocol: "HTTP",
        Port: 80,
        DefaultActions: [
          {
            Type: "fixed-response",
            FixedResponseConfig: {
              StatusCode: "404",
              ContentType: "text/plain",
              MessageBody: "no such site",
            },
          },
        ],
      },
    },
    CheckoutRule: {
      Type: "AWS::ElasticLoadBalancingV2::ListenerRule",
      Properties: {
        ListenerArn: { Ref: "HttpListener" },
        Priority: 10,
        Conditions: [{ Field: "path-pattern", Values: ["/checkout*"] }],
        Actions: [
          { Type: "forward", TargetGroupArn: { Ref: "CheckoutTargets" } },
        ],
      },
    },
    ShopZone: {
      Type: "AWS::Route53::HostedZone",
      Properties: { Name: "example.test" },
    },
    ShopRecord: {
      Type: "AWS::Route53::RecordSet",
      Properties: {
        HostedZoneId: { Ref: "ShopZone" },
        Name: "shop.example.test",
        Type: "A",
        AliasTarget: {
          DNSName: { "Fn::GetAtt": ["ShopAlb", "DNSName"] },
          HostedZoneId: {
            "Fn::GetAtt": ["ShopAlb", "CanonicalHostedZoneID"],
          },
        },
      },
    },
  },
  Outputs: {
    DnsName: { Value: { "Fn::GetAtt": ["ShopAlb", "DNSName"] } },
  },
};

function checkoutHandler(event: SimElbV2Event): SimElbV2Result {
  return {
    statusCode: 200,
    statusDescription: "200 OK",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: event.path, host: event.headers["host"] }),
    isBase64Encoded: false,
  };
}

describe("An ELBv2 routing stack", () => {
  it("carries a request from the load balancer to the function", async () => {
    // Given a deployed stack whose listener rule forwards to a target group
    // holding a bound function.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "shop-stack",
      template: shopTemplate,
      bindings: [{ logicalId: "CheckoutFunction", handler: checkoutHandler }],
    });

    await stack.waitForDeployComplete();
    await simAws.backgroundTasksComplete();

    // When a request arrives at the load balancer's own DNS name.
    const dnsName = simCfnElbV2Output(stack, "DnsName");
    const response = await simElbV2Fetch(
      simAws,
      `http://${dnsName}/checkout/42`,
    );

    // Then the function answered it, so every hop the template declared is
    // connected: the rule, the forward action, the registered target and the
    // invoke permission.
    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(
      await response.text(),
      JSON.stringify({ path: "/checkout/42", host: dnsName }),
    );
  });

  it("reaches the load balancer through the Route53 alias in the stack", async () => {
    // Given the same stack, whose alias record points at the name
    // Fn::GetAtt DNSName gave.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "shop-stack",
      template: shopTemplate,
      bindings: [{ logicalId: "CheckoutFunction", handler: checkoutHandler }],
    });

    await stack.waitForDeployComplete();
    await simAws.backgroundTasksComplete();

    // When the alias name is resolved.
    const target = simAws
      .route53()
      .resolveHttpHost(simRoute53LocalName("shop.example.test"));

    // Then it names the load balancer the GetAtt gave the record.
    const dnsName = simCfnElbV2Output(stack, "DnsName");
    assertObjectMatches(target, {
      service: "elbV2",
      resourceName: dnsName,
    });

    // And a request arriving under that name is served, with the function
    // seeing the name the client asked for rather than the load balancer's.
    const response = await simElbV2Fetch(
      simAws,
      `http://${dnsName}/checkout/42`,
      { headers: { host: "shop.example.test" } },
    );

    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(
      await response.text(),
      JSON.stringify({ path: "/checkout/42", host: "shop.example.test" }),
    );
  });

  it("takes the whole routing setup down with the stack", async () => {
    // Given the deployed stack.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "shop-stack",
      template: shopTemplate,
      bindings: [{ logicalId: "CheckoutFunction", handler: checkoutHandler }],
    });

    await stack.waitForDeployComplete();
    await simAws.backgroundTasksComplete();

    const alb = simAws.elbV2().findLoadBalancerByName("shop-alb");
    assertNonNullable(alb);

    // When the stack is deleted.
    await stack.delete();
    await simAws.backgroundTasksComplete();

    // Then the target group came down after the listener forwarding to it,
    // which is what the reverse dependency order arranges, and nothing is
    // left behind.
    assertUndefined(simAws.elbV2().findLoadBalancerByName("shop-alb"));
    assertUndefined(simAws.elbV2().findListenerOnPort(alb.arn, 80));
  });
});

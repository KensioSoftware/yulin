/**
 * Deploying a load balancer, target group, listener and rule from a template.
 */

import { SimAws } from "@kensio/yulin";
import type { SimElbV2Event, SimElbV2Result } from "@kensio/yulin/elbv2";
import { simElbV2Fetch } from "@kensio/yulin/elbv2";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "shop",
  template: {
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
        Properties: {
          Name: "shop-alb",
          Scheme: "internet-facing",
          // Accepted and left out: there is no VPC here to place one in.
          Subnets: ["subnet-1111", "subnet-2222"],
        },
      },
      CheckoutTargets: {
        Type: "AWS::ElasticLoadBalancingV2::TargetGroup",
        Properties: {
          Name: "checkout-tg",
          TargetType: "lambda",
          // Registered at deploy time, so the group routes straight away.
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
    },
    Outputs: {
      DnsName: { Value: { "Fn::GetAtt": ["ShopAlb", "DNSName"] } },
      FullName: {
        Value: { "Fn::GetAtt": ["ShopAlb", "LoadBalancerFullName"] },
      },
    },
  },
  bindings: [
    {
      logicalId: "CheckoutFunction",
      handler: (event: SimElbV2Event): SimElbV2Result => ({
        statusCode: 200,
        statusDescription: "200 OK",
        headers: { "content-type": "text/plain" },
        body: `checkout ${event.path}`,
        isBase64Encoded: false,
      }),
    },
  ],
});

await stack.waitForDeployComplete();
await simAws.backgroundTasksComplete();

const dnsName = stack.output("DnsName");

console.log(dnsName); // "shop-alb-0000000001.us-east-1.elb.amazonaws.com"
console.log(stack.output("FullName"));
// "app/shop-alb/0000000001"

const claimed = await simElbV2Fetch(simAws, `http://${dnsName}/checkout/42`);

console.log(claimed.status); // 200
console.log(await claimed.text()); // "checkout /checkout/42"

// A request no rule claims falls through to the listener's default action.
const unclaimed = await simElbV2Fetch(simAws, `http://${dnsName}/other`);

console.log(unclaimed.status); // 404

/**
 * Deploying a web ACL from a CloudFormation template.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const visibility = {
  SampledRequestsEnabled: false,
  CloudWatchMetricsEnabled: false,
  MetricName: "orders",
};

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "orders",
  template: {
    Resources: {
      OrdersAcl: {
        Type: "AWS::WAFv2::WebACL",
        Properties: {
          Name: "orders-acl",
          Scope: "REGIONAL",
          DefaultAction: { Allow: {} },
          VisibilityConfig: visibility,
          Rules: [
            {
              Name: "block-admin",
              Priority: 0,
              Action: { Block: {} },
              Statement: {
                ByteMatchStatement: {
                  FieldToMatch: { UriPath: {} },
                  PositionalConstraint: "CONTAINS",
                  SearchString: "/admin",
                  TextTransformations: [{ Priority: 0, Type: "NONE" }],
                },
              },
              VisibilityConfig: { ...visibility, MetricName: "block-admin" },
            },
          ],
        },
      },
    },
    Outputs: { AclArn: { Value: { "Fn::GetAtt": ["OrdersAcl", "Arn"] } } },
  },
});

const decision = simAws.wafV2().evaluateRequest({
  webAclArn: stack.outputs.get("AclArn")!.value as string,
  request: new Request("https://orders.example.test/admin/users"),
});

// "BLOCK"
console.log(decision.action);

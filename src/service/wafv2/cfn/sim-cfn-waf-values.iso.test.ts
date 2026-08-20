import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  deployRestApi,
  simAwsInEuWest2,
} from "../../../../test/apigateway/cfn-deploy.js";
import type { SimRestApi } from "../../apigateway/api/sim-rest-api.js";
import { simCfnRestApiTemplateFactory } from "../../apigateway/cfn/sim-cfn-rest-api-template.factory.js";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimCfnTemplateValue } from "../../cloudformation/template/value/sim-cfn-template-value.js";

const visibility = {
  SampledRequestsEnabled: false,
  CloudWatchMetricsEnabled: false,
  MetricName: "orders",
};

/**
 * A rule blocking whatever a statement claims, so a test about capacity states
 * the statement and nothing else.
 */
function ruleWith(statement: SimCfnTemplateValue): SimCfnTemplateValue {
  return {
    Name: "block",
    Priority: 0,
    Action: { Block: {} },
    Statement: statement,
    VisibilityConfig: { ...visibility, MetricName: "block" },
  };
}

const uriPathMatch = {
  ByteMatchStatement: {
    FieldToMatch: { UriPath: {} },
    PositionalConstraint: "CONTAINS",
    SearchString: "/admin",
    TextTransformations: [{ Priority: 0, Type: "NONE" }],
  },
};

/**
 * Deploy a web ACL and answer with its capacity, as Fn::GetAtt reports it.
 */
async function deployedCapacity(
  rules: SimCfnTemplateValue[],
): Promise<unknown> {
  const simAws = new SimAws();
  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "capacity",
    template: {
      Resources: {
        Acl: {
          Type: "AWS::WAFv2::WebACL",
          Properties: {
            Name: "capacity-acl",
            Scope: "REGIONAL",
            DefaultAction: { Allow: {} },
            VisibilityConfig: visibility,
            Rules: rules,
          },
        },
      },
      Outputs: { Capacity: { Value: { "Fn::GetAtt": ["Acl", "Capacity"] } } },
    },
  });
  await stack.waitForDeployComplete();

  return stack.outputs.get("Capacity")?.value;
}

/**
 * Deploy a stack whose one web ACL publishes the attribute named.
 */
async function deployedAttribute(
  resource: SimCfnTemplateValue,
  attributeName: string,
): Promise<Error> {
  const simAws = new SimAws();

  return await assertThrowsErrorAsync(async () => {
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "attributes",
      template: {
        Resources: { Thing: resource },
        Outputs: {
          Attribute: { Value: { "Fn::GetAtt": ["Thing", attributeName] } },
        },
      },
    });
    await stack.waitForDeployComplete();
  });
}

const webAclResource = {
  Type: "AWS::WAFv2::WebACL",
  Properties: {
    Name: "orders-acl",
    Scope: "REGIONAL",
    DefaultAction: { Allow: {} },
    VisibilityConfig: visibility,
    Rules: [ruleWith(uriPathMatch)],
  },
};

describe("Simulated WAFv2 CloudFormation values", () => {
  it("adds up the capacity of the statements inside a logical statement", async () => {
    // Given a web ACL whose one rule joins three statements, two of them
    // negated or nested.
    const capacity = await deployedCapacity([
      ruleWith({
        AndStatement: {
          Statements: [
            uriPathMatch,
            { NotStatement: { Statement: uriPathMatch } },
            { OrStatement: { Statements: [uriPathMatch, uriPathMatch] } },
          ],
        },
      }),
    ]);

    // Then it costs what its parts cost. A logical statement has no cost of
    // its own, and a byte match is one unit each.
    assertIdentical(capacity, 4);
  });

  it("counts a managed rule group at the capacity AWS fixed it at", async () => {
    // Given a web ACL naming the core rule set with a scope-down statement.
    const capacity = await deployedCapacity([
      {
        Name: "core",
        Priority: 0,
        OverrideAction: { None: {} },
        Statement: {
          ManagedRuleGroupStatement: {
            VendorName: "AWS",
            Name: "AWSManagedRulesCommonRuleSet",
            ScopeDownStatement: uriPathMatch,
          },
        },
        VisibilityConfig: { ...visibility, MetricName: "core" },
      },
    ]);

    // Then the group's own capacity is what it costs, plus the one unit its
    // scope-down statement adds.
    assertIdentical(capacity, 701);
  });

  it("refuses an attribute a web ACL does not publish", async () => {
    // Given a template reading a Scope attribute off a web ACL, which is part
    // of the physical id and no attribute of its own.
    const error = await deployedAttribute(webAclResource, "Scope");

    assertStringIncludes(
      error.message,
      "Unsupported AWS::WAFv2::WebACL attribute Scope",
    );
  });

  it("refuses an attribute a set does not publish", async () => {
    // Given a template reading an Addresses attribute off an IP set.
    const error = await deployedAttribute(
      {
        Type: "AWS::WAFv2::IPSet",
        Properties: {
          Name: "office",
          Scope: "REGIONAL",
          IPAddressVersion: "IPV4",
          Addresses: ["192.0.2.0/24"],
        },
      },
      "Addresses",
    );

    assertStringIncludes(
      error.message,
      "Unsupported AWS::WAFv2::IPSet attribute Addresses",
    );
  });

  it("refuses an attribute off an association, which publishes none", async () => {
    // Given a template reading an attribute off an association.
    const simAws = simAwsInEuWest2();
    const error = await assertThrowsErrorAsync(async () => {
      await deployRestApi(
        simAws,
        simCfnRestApiTemplateFactory.make({
          resources: {
            OrdersAcl: webAclResource,
            OrdersAclAssociation: {
              Type: "AWS::WAFv2::WebACLAssociation",
              Properties: {
                ResourceArn: {
                  "Fn::Join": [
                    "",
                    [
                      "arn:aws:apigateway:",
                      { Ref: "AWS::Region" },
                      "::/restapis/",
                      { Ref: "Api" },
                      "/stages/",
                      { Ref: "Stage" },
                    ],
                  ],
                },
                WebACLArn: { "Fn::GetAtt": ["OrdersAcl", "Arn"] },
              },
            },
          },
          outputs: {
            Association: {
              Value: { "Fn::GetAtt": ["OrdersAclAssociation", "Id"] },
            },
          },
        }),
      );
    });

    assertStringIncludes(
      error.message,
      "Unsupported AWS::WAFv2::WebACLAssociation attribute Id",
    );
  });

  it("records a WAFv2 Resource type nothing simulates as skipped", async () => {
    // Given a template declaring a rule group, which is a resource in its own
    // right and one this simulation does not hold.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "rule-group",
      template: {
        Resources: {
          Group: {
            Type: "AWS::WAFv2::RuleGroup",
            Properties: { Name: "group", Scope: "REGIONAL", Capacity: 10 },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then it was stepped over and reported, rather than treated as deployed.
    const resource = stack.getResource("Group");

    assertNonNullable(resource);
    assertTrue(resource.skipped);
    assertStringIncludes(
      resource.skippedReason ?? "",
      "Unsupported sim WAFv2 CloudFormation Resource RuleGroup",
    );
  });

  it("refuses a Name that is not a string", async () => {
    // Given a template whose web ACL is named with a number.
    const error = await deployedAttribute(
      {
        Type: "AWS::WAFv2::WebACL",
        Properties: {
          Name: 7,
          Scope: "REGIONAL",
          DefaultAction: { Allow: {} },
          VisibilityConfig: visibility,
        },
      },
      "Arn",
    );

    assertStringIncludes(
      error.message,
      "Invalid AWS::WAFv2::WebACL Resource Thing: Name must be a string",
    );
  });

  it("refuses a list property holding something that is not a string", async () => {
    // Given a template whose IP set holds a number among its addresses.
    const error = await deployedAttribute(
      {
        Type: "AWS::WAFv2::IPSet",
        Properties: {
          Name: "office",
          Scope: "REGIONAL",
          IPAddressVersion: "IPV4",
          Addresses: [24],
        },
      },
      "Arn",
    );

    assertStringIncludes(
      error.message,
      "every entry of Addresses must be a string",
    );
  });

  it("tears down an association whose resource has gone already", async () => {
    // Given a REST API in one stack and the web ACL protecting its stage in
    // another, which is what leaves CloudFormation free to take the stage down
    // first: the association names the stage by an ARN rather than by a
    // reference it could order itself against.
    const simAws = simAwsInEuWest2();
    const apiStack = await deployRestApi(
      simAws,
      simCfnRestApiTemplateFactory.make({}),
    );
    const restApi = apiStack.getResource("Api")?.simResource as
      | SimRestApi
      | undefined;

    assertNonNullable(restApi);

    const stageArn = restApi.stageArn("prod");
    const aclStack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-acl-stack",
      template: {
        Resources: {
          OrdersAcl: webAclResource,
          OrdersAclAssociation: {
            Type: "AWS::WAFv2::WebACLAssociation",
            Properties: {
              ResourceArn: stageArn,
              WebACLArn: { "Fn::GetAtt": ["OrdersAcl", "Arn"] },
            },
          },
        },
      },
    });
    await aclStack.waitForDeployComplete();

    assertTrue(simAws.wafV2().protection().protects(stageArn));

    // When the API's stack comes down first and the web ACL's follows.
    await apiStack.teardown();
    await aclStack.teardown();

    // Then the association came down with it. Deleting the stage had already
    // let go of the web ACL, so there was nothing left to disassociate, and
    // the web ACL was free to be deleted after it.
    assertIdentical(
      aclStack.resources.get("OrdersAclAssociation")?.status,
      "DELETE_COMPLETE",
    );
    assertFalse(simAws.wafV2().protection().protects(stageArn));
    assertArrayLength(simAws.wafV2().allWebAcls("REGIONAL"), 0);
  });
});

import {
  DeleteStackCommand,
  UpdateStackCommand,
} from "@aws-sdk/client-cloudformation";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTypeString,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { DEFAULT_SIM_AWS_ACCOUNT_ID } from "../../aws/sim-aws-account.js";
import type { SimCfnStack } from "../../cloudformation/stack/sim-cfn-stack.js";
import type { CfnTemplateBodyRecord } from "../../cloudformation/template/sim-cfn-template.js";
import type { SimCfnTemplateValue } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import { jsonStringify } from "../../../util/type-guard/json.js";
import { simWafBrowserRequest } from "../sim-wafv2.fixture.js";

const visibility = {
  SampledRequestsEnabled: false,
  CloudWatchMetricsEnabled: false,
  MetricName: "orders",
};

/**
 * A rule blocking whatever asks for an admin path, spelled as a template
 * spells it: the search string is a plain string, where the SDK takes bytes.
 */
const blockAdmin = {
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
};

/**
 * A template declaring one web ACL, with whatever properties a test is about
 * written over the ones every test here needs.
 */
function webAclTemplate(
  properties: Record<string, SimCfnTemplateValue> = {},
): CfnTemplateBodyRecord {
  return {
    Resources: {
      OrdersAcl: {
        Type: "AWS::WAFv2::WebACL",
        Properties: {
          Name: "orders-acl",
          Scope: "REGIONAL",
          DefaultAction: { Allow: {} },
          VisibilityConfig: visibility,
          Rules: [blockAdmin],
          ...properties,
        },
      },
    },
    Outputs: {
      AclRef: { Value: { Ref: "OrdersAcl" } },
      AclArn: { Value: { "Fn::GetAtt": ["OrdersAcl", "Arn"] } },
      AclId: { Value: { "Fn::GetAtt": ["OrdersAcl", "Id"] } },
      AclCapacity: { Value: { "Fn::GetAtt": ["OrdersAcl", "Capacity"] } },
      AclLabels: { Value: { "Fn::GetAtt": ["OrdersAcl", "LabelNamespace"] } },
    },
  };
}

async function deployWebAcl(
  simAws: SimAws,
  properties: Record<string, SimCfnTemplateValue> = {},
): Promise<SimCfnStack> {
  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "orders",
    template: webAclTemplate(properties),
  });
  await stack.waitForDeployComplete();

  return stack;
}

/**
 * What the deployed web ACL does with a request to one path.
 */
function decisionFor(simAws: SimAws, stack: SimCfnStack, path: string): string {
  const webAclArn = stack.outputs.get("AclArn")?.value;
  assertTypeString(webAclArn);

  return simAws.wafV2().evaluateRequest({
    webAclArn,
    request: simWafBrowserRequest(`https://orders.example.com${path}`),
  }).action;
}

describe("AWS::WAFv2::WebACL", () => {
  it("deploys a web ACL that decides requests by the rules the template wrote", async () => {
    // Given a template declaring a web ACL that blocks admin paths.
    const simAws = new SimAws();
    const stack = await deployWebAcl(simAws);

    // Then the deployed web ACL is the one WAFv2 holds, and it decides
    // requests by the rule the template gave it.
    assertArrayLength(simAws.wafV2().allWebAcls("REGIONAL"), 1);
    assertIdentical(decisionFor(simAws, stack, "/admin/users"), "BLOCK");
    assertIdentical(decisionFor(simAws, stack, "/orders"), "ALLOW");
  });

  it("deploys a web ACL whose only rule limits a request rate", async () => {
    // Given a template whose one rule counts sign-ups, which is what CDK's
    // protection for a user pool writes and the whole of what such a web ACL
    // holds.
    const simAws = new SimAws();
    const stack = await deployWebAcl(simAws, {
      Rules: [
        {
          Name: "account-creation-rate",
          Priority: 0,
          Action: { Block: {} },
          Statement: {
            RateBasedStatement: {
              Limit: 10,
              EvaluationWindowSec: 300,
              AggregateKeyType: "IP",
              ScopeDownStatement: {
                ByteMatchStatement: {
                  FieldToMatch: { UriPath: {} },
                  PositionalConstraint: "STARTS_WITH",
                  SearchString: "/signup",
                  TextTransformations: [{ Priority: 0, Type: "LOWERCASE" }],
                },
              },
            },
          },
          VisibilityConfig: {
            ...visibility,
            MetricName: "account-creation-rate",
          },
        },
      ],
    });

    // Then nothing was left out of the web ACL, and the rule limits what the
    // template said it would.
    assertArrayLength(stack.ignoredProperties, 0);

    const decisions = Array.from({ length: 11 }, () =>
      decisionFor(simAws, stack, "/signup"),
    );

    assertIdentical(decisions[9], "ALLOW");
    assertIdentical(decisions[10], "BLOCK");
    assertIdentical(decisionFor(simAws, stack, "/orders"), "ALLOW");
  });

  it("leaves out a rate limit aggregating on what it cannot read", async () => {
    // Given a template whose rate limit counts by forwarded address, beside a
    // rule this simulation does evaluate.
    const simAws = new SimAws();
    const stack = await deployWebAcl(simAws, {
      Rules: [
        {
          Name: "forwarded-rate",
          Priority: 1,
          Action: { Block: {} },
          Statement: {
            RateBasedStatement: {
              Limit: 100,
              AggregateKeyType: "FORWARDED_IP",
            },
          },
          VisibilityConfig: { ...visibility, MetricName: "forwarded-rate" },
        },
        blockAdmin,
      ],
    });

    // Then the rate limit was left out and recorded, and the web ACL deployed
    // with the rule beside it still deciding requests. A refused aggregation
    // key costs the rule and nothing larger than the rule.
    const [dropped] = stack.ignoredProperties;

    assertNonNullable(dropped);
    assertIdentical(dropped.path, "Rules.forwarded-rate");
    assertStringIncludes(dropped.reason, "FORWARDED_IP");
    assertArrayLength(stack.skippedResources, 0);
    assertIdentical(decisionFor(simAws, stack, "/admin/users"), "BLOCK");
  });

  it("answers Fn::GetAtt with the four attributes a web ACL publishes", async () => {
    // Given a deployed web ACL whose attributes are all outputs.
    const simAws = new SimAws();
    const stack = await deployWebAcl(simAws);
    const webAcl = simAws.wafV2().allWebAcls("REGIONAL")[0];

    assertNonNullable(webAcl);

    // Then each attribute answers with what the web ACL carries. The capacity
    // is what AWS charges for the one rule's CONTAINS byte match, and the
    // label namespace is the prefix AWS qualifies this web ACL's labels with.
    assertIdentical(stack.outputs.get("AclArn")?.value, webAcl.arn);
    assertIdentical(stack.outputs.get("AclId")?.value, webAcl.id);
    assertIdentical(stack.outputs.get("AclCapacity")?.value, 10);
    assertIdentical(
      stack.outputs.get("AclLabels")?.value,
      `awswaf:${DEFAULT_SIM_AWS_ACCOUNT_ID}:webacl:orders-acl:`,
    );
  });

  it("answers Ref with the physical id, which WAFv2 spells in three parts", async () => {
    // Given a deployed web ACL whose Ref is an output.
    const simAws = new SimAws();
    const stack = await deployWebAcl(simAws);
    const webAcl = simAws.wafV2().allWebAcls("REGIONAL")[0];

    assertNonNullable(webAcl);

    // Then it is the name, the id and the scope joined by pipes. WAFv2 is a
    // registry type with a composite primary identifier, so a Ref gives that
    // back rather than the ARN a template usually wants.
    assertIdentical(
      stack.outputs.get("AclRef")?.value,
      `orders-acl|${webAcl.id}|REGIONAL`,
    );
  });

  it("names an unnamed web ACL after the stack and the logical id", async () => {
    // Given a template that leaves Name out, which CloudFormation allows.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders",
      template: {
        Resources: {
          OrdersAcl: {
            Type: "AWS::WAFv2::WebACL",
            Properties: {
              Scope: "REGIONAL",
              DefaultAction: { Allow: {} },
              VisibilityConfig: visibility,
            },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then the web ACL carries the name CloudFormation generated for it.
    assertIdentical(
      simAws.wafV2().allWebAcls("REGIONAL")[0]?.name,
      "orders-OrdersAcl",
    );
  });

  it("writes the new rules over the web ACL when the template changes", async () => {
    // Given a deployed web ACL blocking admin paths.
    const simAws = new SimAws();
    await deployWebAcl(simAws);

    // When the stack is updated with the rule pointed somewhere else.
    const cloudFormation = simAws.cloudFormation();
    const updatedTemplate = webAclTemplate({
      Rules: [
        {
          ...blockAdmin,
          Statement: {
            ByteMatchStatement: {
              ...blockAdmin.Statement.ByteMatchStatement,
              SearchString: "/reports",
            },
          },
        },
      ],
    });

    await cloudFormation.updateStack(
      new UpdateStackCommand({
        StackName: "orders",
        TemplateBody: jsonStringify(updatedTemplate),
      }),
    );
    await cloudFormation.waitForStackUpdateComplete("orders");

    const updated = cloudFormation.getStackByName("orders");

    assertNonNullable(updated);

    // Then the request the old rules blocked is allowed and the new one is
    // blocked, and there is still one web ACL rather than two.
    assertArrayLength(simAws.wafV2().allWebAcls("REGIONAL"), 1);
    assertIdentical(decisionFor(simAws, updated, "/admin/users"), "ALLOW");
    assertIdentical(decisionFor(simAws, updated, "/reports/q1"), "BLOCK");
  });

  it("deletes the web ACL when the stack comes down", async () => {
    // Given a deployed web ACL.
    const simAws = new SimAws();
    await deployWebAcl(simAws);

    // When the stack is deleted.
    await simAws
      .cloudFormation()
      .deleteStack(new DeleteStackCommand({ StackName: "orders" }));
    await simAws.backgroundTasksComplete();

    // Then the web ACL went with it.
    assertArrayLength(simAws.wafV2().allWebAcls("REGIONAL"), 0);
  });

  it("deploys a web ACL without the rule it cannot evaluate", async () => {
    // Given a template whose rule inspects the client address, which every
    // request in this simulation shares.
    const simAws = new SimAws();
    const stack = await deployWebAcl(simAws, {
      Rules: [
        {
          ...blockAdmin,
          Statement: {
            IPSetReferenceStatement: {
              ARN: "arn:aws:wafv2:us-east-1:111111111111:regional/ipset/o/1",
            },
          },
        },
      ],
    });

    // Then the web ACL deployed with no rules, and the one it lost is recorded
    // under the logical id that declared it, with the rule and the statement
    // kind WAFv2 would not compile. Best effort is covered in
    // sim-cfn-waf-best-effort.iso.test.ts.
    assertArrayLength(simAws.wafV2().allWebAcls("REGIONAL"), 1);
    assertIdentical(decisionFor(simAws, stack, "/admin/users"), "ALLOW");

    const ignoredProperty = stack.ignoredProperties[0];

    assertNonNullable(ignoredProperty);
    assertIdentical(ignoredProperty.logicalId, "OrdersAcl");
    assertIdentical(ignoredProperty.path, "Rules.block-admin");
    assertStringIncludes(ignoredProperty.reason, "Rule block-admin");
    assertStringIncludes(ignoredProperty.reason, "IPSetReferenceStatement");
  });

  it("refuses a Rules property that is not a list", async () => {
    // Given a template whose Rules is an object.
    const simAws = new SimAws();
    const error = await assertThrowsErrorAsync(async () => {
      await deployWebAcl(simAws, { Rules: { Name: "block-admin" } });
    });

    // Then the refusal says which Resource could not be read.
    assertStringIncludes(
      error.message,
      "Invalid AWS::WAFv2::WebACL Resource OrdersAcl: Rules must be a list",
    );
  });
});

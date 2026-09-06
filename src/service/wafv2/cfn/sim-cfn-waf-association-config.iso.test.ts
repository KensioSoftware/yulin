import {
  assertArrayEmpty,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertTypeString,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimCfnDeployedStack } from "../../cloudformation/stack/sim-cfn-deployed-stack.type.js";
import type { SimCfnTemplateValue } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import { simWafBrowserRequest } from "../sim-wafv2.fixture.js";

const visibility = {
  SampledRequestsEnabled: false,
  CloudWatchMetricsEnabled: false,
  MetricName: "orders",
};

/**
 * A rule blocking any request whose body WAF could not read to the end.
 *
 * `MATCH` is what makes the body inspection limit visible from outside: the
 * rule blocks exactly the bodies that went past it.
 */
const blockUnreadBody = {
  Name: "block-unread-body",
  Priority: 0,
  Action: { Block: {} },
  Statement: {
    ByteMatchStatement: {
      FieldToMatch: { Body: { OversizeHandling: "MATCH" } },
      PositionalConstraint: "CONTAINS",
      SearchString: "needle",
      TextTransformations: [{ Priority: 0, Type: "NONE" }],
    },
  },
  VisibilityConfig: { ...visibility, MetricName: "block-unread-body" },
};

/**
 * Deploy a web ACL carrying one `AssociationConfig`.
 */
async function deployWebAcl(
  simAws: SimAws,
  associationConfig: SimCfnTemplateValue,
): Promise<SimCfnDeployedStack> {
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
            Rules: [blockUnreadBody],
            AssociationConfig: associationConfig,
          },
        },
      },
      Outputs: {
        AclArn: { Value: { "Fn::GetAtt": ["OrdersAcl", "Arn"] } },
      },
    },
  });
  await stack.waitForDeployComplete();

  return stack;
}

/**
 * What the deployed web ACL does with a request carrying a body of one size.
 */
function decisionFor(
  simAws: SimAws,
  stack: SimCfnDeployedStack,
  bodyBytes: number,
): string {
  const webAclArn = stack.outputs.get("AclArn")?.value;

  assertTypeString(webAclArn);

  return simAws.wafV2().evaluateRequest({
    webAclArn,
    request: simWafBrowserRequest("https://orders.example.com/orders", {
      method: "POST",
    }),
    body: new TextEncoder().encode("x".repeat(bodyBytes)),
    resourceType: "API_GATEWAY",
  }).action;
}

describe("AWS::WAFv2::WebACL AssociationConfig", () => {
  it("deploys the body inspection limit it sets", async () => {
    // Given a template raising the body a REST API stage sends for inspection
    // to 48 KB.
    const simAws = new SimAws();
    const stack = await deployWebAcl(simAws, {
      RequestBody: { API_GATEWAY: { DefaultSizeInspectionLimit: "KB_48" } },
    });

    // Then the member deployed rather than being recorded as unsimulated, and
    // a 40 KB body is inspected instead of being blocked unread.
    assertArrayEmpty(stack.ignoredProperties);
    assertArrayEmpty(stack.skippedResources);
    assertIdentical(decisionFor(simAws, stack, 40 * 1024), "ALLOW");
  });

  it("leaves the web ACL out when it names a resource type Yulin cannot protect", async () => {
    // Given a template setting the limit for a resource type nothing here goes
    // in front of.
    const simAws = new SimAws();
    const stack = await deployWebAcl(simAws, {
      RequestBody: {
        VERIFIED_ACCESS_INSTANCE: { DefaultSizeInspectionLimit: "KB_32" },
      },
    });

    // Then the web ACL is skipped and the reason names the resource type,
    // which leaves the rest of the stack deployed.
    const [skipped] = stack.skippedResources;

    assertNonNullable(skipped);
    assertStringIncludes(
      skipped.skippedReason ?? "",
      "VERIFIED_ACCESS_INSTANCE",
    );
  });
});

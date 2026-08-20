/**
 * The template pieces the WAFv2 best effort deployment tests share.
 *
 * Both suites deploy a web ACL carrying a rule Yulin cannot evaluate, one to
 * watch the web ACL deploy without it and one to watch what happens to the
 * things in front of it. This lives under `test/` for the same reasons as the
 * other fixtures here: eslint rejects a test file that exports helpers
 * alongside its own `describe` calls, and `test/**` is type-checked with
 * everything else, excluded from the published build, not collected as a
 * suite, and not counted in coverage.
 */

import { assertNonNullable } from "@kensio/smartass";

import type { SimCfnIgnoredProperty } from "../../src/service/cloudformation/resource/ignore/sim-cfn-ignored-property.type.js";
import type { SimCfnStack } from "../../src/service/cloudformation/stack/sim-cfn-stack.js";
import type { SimCfnTemplateValueRecord } from "../../src/service/cloudformation/template/value/sim-cfn-template-value.js";

const visibility = {
  SampledRequestsEnabled: false,
  CloudWatchMetricsEnabled: false,
  MetricName: "orders",
};

/**
 * A rule counting requests over a time window, which is the statement kind
 * Yulin does not evaluate that a real stack is most likely to carry. CDK's
 * sign-up protection for a user pool writes one.
 */
export const simWafRateLimitSignUps = {
  Name: "account-creation-rate",
  Priority: 0,
  Action: { Block: {} },
  Statement: { RateBasedStatement: { Limit: 100, AggregateKeyType: "IP" } },
  VisibilityConfig: { ...visibility, MetricName: "account-creation-rate" },
};

/**
 * A rule blocking whatever asks for an admin path, which Yulin evaluates.
 */
export const simWafBlockAdmin = {
  Name: "block-admin",
  Priority: 1,
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
 * A web ACL Resource carrying one rule Yulin can evaluate and one it cannot.
 */
export const simWafMixedAclResource = {
  Type: "AWS::WAFv2::WebACL",
  Properties: {
    Name: "orders-acl",
    Scope: "REGIONAL",
    DefaultAction: { Allow: {} },
    VisibilityConfig: visibility,
    Rules: [simWafRateLimitSignUps, simWafBlockAdmin],
  },
};

/** How a template names the web ACL beside it. */
export const simWafAclArnReference = { "Fn::GetAtt": ["OrdersAcl", "Arn"] };

/** A web ACL ARN of the right shape that no simulation holds. */
export const simWafRealAccountAclArn =
  "arn:aws:wafv2:eu-west-2:888888888888:regional/webacl/live/" +
  "4a2b1c8d-0e6f-4a2b-9c8d-0e6f4a2b1c8d";

/** The stage ARN as CDK writes it beside a REST API. */
export const simWafStageArn = {
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
};

/**
 * An association Resource putting a web ACL in front of something.
 */
export function simWafAssociationResource(
  resourceArn: SimCfnTemplateValueRecord | string,
  webAclArn: SimCfnTemplateValueRecord | string = simWafAclArnReference,
): SimCfnTemplateValueRecord {
  return {
    Type: "AWS::WAFv2::WebACLAssociation",
    Properties: { ResourceArn: resourceArn, WebACLArn: webAclArn },
  };
}

/**
 * The one property a deployment recorded as ignored.
 */
export function simWafIgnoredProperty(
  stack: SimCfnStack,
): SimCfnIgnoredProperty {
  const [property] = stack.ignoredProperties;

  assertNonNullable(property);

  return property;
}

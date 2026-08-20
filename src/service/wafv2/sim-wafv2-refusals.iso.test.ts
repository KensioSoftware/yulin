import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";
import { simWafCreateWebAclFactory } from "./command/web-acl/sim-waf-create-web-acl.factory.js";
import type { SimCreateWebAclCommandInput } from "./command/web-acl/web-acl.command.js";
import { SimWafUnsimulatedInputException } from "./error/sim-wafv2.error.js";
import { createSimWafWebAcl } from "./sim-wafv2.fixture.js";
import type { SimWafStatementInput } from "./statement/sim-waf-statement.type.js";
import type { SimWafRuleInput } from "./web-acl/sim-waf-rule.type.js";
import { simWafRuleFactory } from "./web-acl/sim-waf-rule.factory.js";

/**
 * Try to create a web ACL, and answer with whatever it was refused for.
 */
async function refusalFor(
  webAcl: Partial<SimCreateWebAclCommandInput>,
): Promise<Error> {
  const waf = new SimAws().wafV2();

  return await assertThrowsErrorAsync(async () => {
    await createSimWafWebAcl(waf, {
      ...simWafCreateWebAclFactory.make(),
      ...webAcl,
    });
  });
}

/**
 * Try to create a web ACL holding one rule, and answer with the refusal.
 */
async function refusalForRule(rule: SimWafRuleInput): Promise<Error> {
  return await refusalFor({ Rules: [rule] });
}

/**
 * Try to create a web ACL whose one rule carries a statement, and answer with
 * the refusal.
 */
async function refusalForStatement(
  statement: SimWafStatementInput,
): Promise<Error> {
  return await refusalForRule({
    ...simWafRuleFactory.make({ Name: "the-rule" }),
    Statement: statement,
  });
}

describe("SimWafV2 refusals", () => {
  it("refuses a rule on the client address", async () => {
    // When a rule matches on an IP set or on a country.
    const ipSet = await refusalForStatement({
      IPSetReferenceStatement: {
        ARN: "arn:aws:wafv2:eu-west-2:111111111111:regional/ipset/x/y",
      },
    });
    const geo = await refusalForStatement({
      GeoMatchStatement: { CountryCodes: ["CN"] },
    });

    // Then both are refused, naming the rule and the kind. Every request here
    // comes from 127.0.0.1, so either rule would see one client for the whole
    // simulation.
    assertInstanceOf(ipSet, SimWafUnsimulatedInputException);
    assertStringIncludes(ipSet.message, "the-rule");
    assertStringIncludes(ipSet.message, "IPSetReferenceStatement");
    assertStringIncludes(geo.message, "GeoMatchStatement");
    assertStringIncludes(geo.message, "127.0.0.1");
  });

  it("refuses a rate based rule", async () => {
    // When a rule limits by request rate.
    const error = await refusalForStatement({
      RateBasedStatement: { Limit: 100, AggregateKeyType: "IP" },
    });

    // Then it is refused rather than accepted and never enforced. Counting
    // requests over a window against the simulated clock is feasible and is
    // not part of this.
    assertInstanceOf(error, SimWafUnsimulatedInputException);
    assertStringIncludes(error.message, "RateBasedStatement");
  });

  it("refuses the injection detections AWS does not document", async () => {
    // When a rule uses the SQL injection or cross-site scripting detection.
    const sqli = await refusalForStatement({
      SqliMatchStatement: {
        FieldToMatch: { UriPath: {} },
        TextTransformations: [{ Priority: 0, Type: "NONE" }],
      },
    });
    const xss = await refusalForStatement({
      XssMatchStatement: {
        FieldToMatch: { UriPath: {} },
        TextTransformations: [{ Priority: 0, Type: "NONE" }],
      },
    });

    // Then both are refused: AWS publishes no description of what they detect,
    // so a simulation of them would agree with real WAF by coincidence.
    assertStringIncludes(sqli.message, "SqliMatchStatement");
    assertStringIncludes(xss.message, "XssMatchStatement");
  });

  it("refuses the rule group statements", async () => {
    // When a rule refers to a managed or customer rule group, or to a label
    // one of them would have added.
    const managed = await refusalForStatement({
      ManagedRuleGroupStatement: {
        VendorName: "AWS",
        Name: "AWSManagedRulesCommonRuleSet",
      },
    });
    const group = await refusalForStatement({
      RuleGroupReferenceStatement: {
        ARN: "arn:aws:wafv2:eu-west-2:111111111111:regional/rulegroup/x/y",
      },
    });
    const label = await refusalForStatement({
      LabelMatchStatement: { Scope: "LABEL", Key: "awswaf:managed:aws:x" },
    });

    // Then each is refused by name.
    assertStringIncludes(managed.message, "ManagedRuleGroupStatement");
    assertStringIncludes(group.message, "RuleGroupReferenceStatement");
    assertStringIncludes(label.message, "LabelMatchStatement");
  });

  it("refuses a field to match this simulation does not read", async () => {
    // When a rule reads a parsed JSON body.
    const error = await refusalForStatement({
      ByteMatchStatement: {
        SearchString: "x",
        PositionalConstraint: "CONTAINS",
        FieldToMatch: {
          JsonBody: {
            MatchPattern: { All: {} },
            MatchScope: "VALUE",
            OversizeHandling: "CONTINUE",
          },
        },
        TextTransformations: [{ Priority: 0, Type: "NONE" }],
      },
    });

    // Then it is refused rather than read as a rule with no field, which would
    // match nothing and let the request through.
    assertInstanceOf(error, SimWafUnsimulatedInputException);
    assertStringIncludes(error.message, "JsonBody");
  });

  it("refuses a TLS fingerprint field", async () => {
    // When a rule reads the fingerprint of the TLS handshake.
    const error = await refusalForStatement({
      ByteMatchStatement: {
        SearchString: "x",
        PositionalConstraint: "CONTAINS",
        FieldToMatch: { JA4Fingerprint: { FallbackBehavior: "NO_MATCH" } },
        TextTransformations: [{ Priority: 0, Type: "NONE" }],
      },
    });

    // Then it is refused: a request that reached a simulated service made no
    // handshake to fingerprint.
    assertStringIncludes(error.message, "JA4Fingerprint");
  });

  it("refuses a text transformation this simulation does not apply", async () => {
    // When a rule asks for a transformation outside the simulated set.
    const error = await refusalForStatement({
      ByteMatchStatement: {
        SearchString: "x",
        PositionalConstraint: "CONTAINS",
        FieldToMatch: { UriPath: {} },
        TextTransformations: [{ Priority: 0, Type: "BASE64_DECODE" }],
      },
    });

    // Then it is refused rather than silently left out, which would compare
    // the raw value against a search string written for the decoded one.
    assertInstanceOf(error, SimWafUnsimulatedInputException);
    assertStringIncludes(error.message, "BASE64_DECODE");
  });

  it("refuses the actions that need a browser to answer them", async () => {
    // When a rule answers with a CAPTCHA or a challenge.
    const captcha = await refusalForRule({
      ...simWafRuleFactory.make({ Name: "the-rule" }),
      Action: { Captcha: {} },
    });
    const challenge = await refusalForRule({
      ...simWafRuleFactory.make({ Name: "the-rule" }),
      Action: { Challenge: {} },
    });

    // Then both are refused: a test has no browser to solve the puzzle and
    // send the token back.
    assertStringIncludes(captcha.message, "Captcha");
    assertStringIncludes(challenge.message, "Challenge");
  });

  it("refuses a rule carrying labels nothing can read", async () => {
    // When a rule adds a label.
    const error = await refusalForRule(
      simWafRuleFactory.make({
        Name: "the-rule",
        RuleLabels: [{ Name: "internal" }],
      }),
    );

    // Then it is refused, because LabelMatchStatement arrives with the managed
    // rule groups and nothing here would read the label.
    assertStringIncludes(error.message, "RuleLabels");
  });

  it("refuses a web ACL member this simulation does not model", async () => {
    // When a web ACL sets the body size its associations inspect.
    const error = await refusalFor({
      AssociationConfig: {
        RequestBody: { CLOUDFRONT: { DefaultSizeInspectionLimit: "KB_16" } },
      },
    });

    // Then it is refused, since nothing is associated with a web ACL yet.
    assertInstanceOf(error, SimWafUnsimulatedInputException);
    assertStringIncludes(error.message, "AssociationConfig");
  });

  it("refuses tags on a web ACL", async () => {
    // When a web ACL is created with tags.
    const error = await refusalFor({
      Tags: [{ Key: "Team", Value: "payments" }],
    });

    // Then they are refused rather than dropped, because nothing here would
    // report them back.
    assertInstanceOf(error, SimWafUnsimulatedInputException);
    assertStringIncludes(error.message, "tags");
  });
});

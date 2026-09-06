import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";
import { simWafCreateWebAclFactory } from "./command/web-acl/sim-waf-create-web-acl.factory.js";
import type { SimCreateWebAclCommandInput } from "./command/web-acl/web-acl.command.js";
import {
  SimWafInvalidParameterException,
  SimWafUnsimulatedInputException,
} from "./error/sim-wafv2.error.js";
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

  it("refuses a rate based rule aggregating on what it cannot read", async () => {
    // When a rule counts by forwarded address or by a custom key.
    const forwarded = await refusalForStatement({
      RateBasedStatement: { Limit: 100, AggregateKeyType: "FORWARDED_IP" },
    });
    const custom = await refusalForStatement({
      RateBasedStatement: {
        Limit: 100,
        AggregateKeyType: "CUSTOM_KEYS",
        CustomKeys: [{ Header: { Name: "x-tenant" } }],
      },
    });

    // Then both are refused, and the rate limiting Yulin does evaluate is
    // left alone. A forwarded address needs the source address variety an IP
    // set is waiting on, and a custom key aggregates on request content.
    assertInstanceOf(forwarded, SimWafUnsimulatedInputException);
    assertStringIncludes(forwarded.message, "FORWARDED_IP");
    assertInstanceOf(custom, SimWafUnsimulatedInputException);
    assertStringIncludes(custom.message, "CustomKeys");
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

  it("refuses a rule group of the reader's own", async () => {
    // When a rule refers to a rule group the reader wrote.
    const error = await refusalForStatement({
      RuleGroupReferenceStatement: {
        ARN: "arn:aws:wafv2:eu-west-2:111111111111:regional/rulegroup/x/y",
      },
    });

    // Then it is refused by name: a rule group is a resource in its own right,
    // and none is simulated. The AWS managed groups are, and they are named in
    // a statement rather than created.
    assertInstanceOf(error, SimWafUnsimulatedInputException);
    assertStringIncludes(error.message, "RuleGroupReferenceStatement");
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

  it("refuses a body inspection limit that is not one of the four sizes", async () => {
    // When a web ACL asks for a body inspection limit AWS has no setting for.
    const error = await refusalFor({
      AssociationConfig: {
        RequestBody: { CLOUDFRONT: { DefaultSizeInspectionLimit: "KB_24" } },
      },
    });

    // Then it is refused, the way WAFv2 refuses the value.
    assertInstanceOf(error, SimWafInvalidParameterException);
    assertStringIncludes(error.message, "KB_24");
  });

  it("refuses a RequestBody entry that sets no body inspection limit", async () => {
    // When a web ACL names a resource type and says nothing about the limit,
    // which a hand-written template is where this comes from.
    const error = await refusalFor({
      AssociationConfig: { RequestBody: { CLOUDFRONT: undefined } },
    });

    // Then it is refused the way an unusable size is, ahead of the type error
    // reading a limit off nothing would have raised.
    assertInstanceOf(error, SimWafInvalidParameterException);
    assertStringIncludes(error.message, "DefaultSizeInspectionLimit");
  });

  it("refuses a body inspection limit for a resource type it cannot protect", async () => {
    // When a web ACL sets the limit for a resource type nothing here goes in
    // front of.
    const error = await refusalFor({
      AssociationConfig: {
        RequestBody: {
          APP_RUNNER_SERVICE: { DefaultSizeInspectionLimit: "KB_32" },
        },
      },
    });

    // Then it is refused rather than accepted and never applied.
    assertInstanceOf(error, SimWafUnsimulatedInputException);
    assertStringIncludes(error.message, "APP_RUNNER_SERVICE");
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

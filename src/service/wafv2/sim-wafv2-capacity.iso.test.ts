import { GetWebACLCommand } from "@aws-sdk/client-wafv2";
import { assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";
import { simWafCreateWebAclFactory } from "./command/web-acl/sim-waf-create-web-acl.factory.js";
import type { SimWafStatementInput } from "./statement/sim-waf-statement.type.js";
import { simWafVisibilityConfig } from "./web-acl/sim-waf-rule.factory.js";
import type { SimWafRuleInput } from "./web-acl/sim-waf-rule.type.js";
import { createSimWafWebAcl } from "./sim-wafv2.fixture.js";

const noTransformation = [{ Priority: 0, Type: "NONE" }];

/**
 * A rule blocking whatever a statement claims, so a test about what a rule
 * costs states the statement and nothing else.
 */
function ruleWith(statement: SimWafStatementInput): SimWafRuleInput {
  return {
    Name: "block",
    Priority: 0,
    Action: { Block: {} },
    Statement: statement,
    VisibilityConfig: simWafVisibilityConfig,
  };
}

/**
 * What GetWebACL reports a web ACL of these rules costs.
 */
async function capacityOf(
  rules: readonly SimWafRuleInput[],
): Promise<number | undefined> {
  const waf = new SimAws().wafV2();
  const created = await createSimWafWebAcl(
    waf,
    simWafCreateWebAclFactory.make({ Rules: rules }),
  );
  const read = await waf.getWebAcl(
    new GetWebACLCommand({
      Name: created.Name,
      Id: created.Id,
      Scope: "REGIONAL",
    }),
  );

  return read.WebACL?.Capacity;
}

/**
 * A byte match on the URI path, making the kind of match named.
 */
function byteMatch(positionalConstraint: string): SimWafStatementInput {
  return {
    ByteMatchStatement: {
      SearchString: "/admin",
      PositionalConstraint: positionalConstraint,
      FieldToMatch: { UriPath: {} },
      TextTransformations: noTransformation,
    },
  };
}

describe("What a simulated web ACL costs in capacity units", () => {
  it("charges a byte match by the kind of match it makes", async () => {
    // Given two web ACLs whose rules differ only in the match they make.
    const exact = await capacityOf([ruleWith(byteMatch("EXACTLY"))]);
    const contains = await capacityOf([ruleWith(byteMatch("CONTAINS"))]);

    // Then each is charged what AWS publishes for it. Scanning for a string
    // anywhere in a component costs five times what comparing the whole of it
    // does.
    assertIdentical(exact, 2);
    assertIdentical(contains, 10);
  });

  it("charges ten for every text transformation but NONE", async () => {
    // Given a rule lowercasing and URL-decoding before it matches.
    const capacity = await capacityOf([
      ruleWith({
        ByteMatchStatement: {
          SearchString: "/admin",
          PositionalConstraint: "STARTS_WITH",
          FieldToMatch: { UriPath: {} },
          TextTransformations: [
            { Priority: 0, Type: "URL_DECODE" },
            { Priority: 1, Type: "LOWERCASE" },
          ],
        },
      }),
    ]);

    // Then the two transformations cost ten each on top of the base cost. A
    // NONE transformation is free, which is what the byte match above shows.
    assertIdentical(capacity, 22);
  });

  it("charges ten more for inspecting every query argument", async () => {
    // Given a rule reading all the query arguments rather than one component.
    const capacity = await capacityOf([
      ruleWith({
        ByteMatchStatement: {
          SearchString: "admin",
          PositionalConstraint: "EXACTLY",
          FieldToMatch: { AllQueryArguments: {} },
          TextTransformations: noTransformation,
        },
      }),
    ]);

    assertIdentical(capacity, 12);
  });

  it("charges each of the other statement kinds its own base cost", async () => {
    // Given a rule of each remaining kind this simulation evaluates.
    const regexMatch = await capacityOf([
      ruleWith({
        RegexMatchStatement: {
          RegexString: "^/admin",
          FieldToMatch: { UriPath: {} },
          TextTransformations: noTransformation,
        },
      }),
    ]);
    const sizeConstraint = await capacityOf([
      ruleWith({
        SizeConstraintStatement: {
          ComparisonOperator: "GT",
          Size: 100,
          FieldToMatch: { QueryString: {} },
          TextTransformations: noTransformation,
        },
      }),
    ]);
    const labelMatch = await capacityOf([
      ruleWith({
        LabelMatchStatement: { Scope: "LABEL", Key: "seen" },
      }),
    ]);

    // Then each is charged what AWS publishes. A pattern set reference is the
    // dearest of them, which is why AWS suggests a regex match where the
    // matching can be written as one expression.
    assertIdentical(regexMatch, 3);
    assertIdentical(sizeConstraint, 1);
    assertIdentical(labelMatch, 1);
  });

  it("charges a pattern set reference twenty-five", async () => {
    // Given a rule pointing at a regex pattern set.
    const waf = new SimAws().wafV2();
    const patternSet = await waf.createRegexPatternSet({
      input: {
        Name: "scanners",
        Scope: "REGIONAL",
        RegularExpressionList: [{ RegexString: "sqlmap" }],
      },
    });
    const created = await createSimWafWebAcl(
      waf,
      simWafCreateWebAclFactory.make({
        Rules: [
          ruleWith({
            RegexPatternSetReferenceStatement: {
              ARN: patternSet.Summary?.ARN,
              FieldToMatch: { UriPath: {} },
              TextTransformations: noTransformation,
            },
          }),
        ],
      }),
    );
    const read = await waf.getWebAcl(
      new GetWebACLCommand({
        Name: created.Name,
        Id: created.Id,
        Scope: "REGIONAL",
      }),
    );

    assertIdentical(read.WebACL?.Capacity, 25);
  });

  it("adds up the statements inside a logical statement", async () => {
    // Given a rule joining three statements, one of them negated.
    const capacity = await capacityOf([
      ruleWith({
        AndStatement: {
          Statements: [
            byteMatch("EXACTLY"),
            { NotStatement: { Statement: byteMatch("EXACTLY") } },
            { OrStatement: { Statements: [byteMatch("CONTAINS")] } },
          ],
        },
      }),
    ]);

    // Then it costs what its parts cost. A logical statement has no base cost
    // of its own.
    assertIdentical(capacity, 14);
  });

  it("charges a managed rule group at the capacity AWS fixed it at", async () => {
    // Given a rule naming the core rule set with a scope-down statement.
    const capacity = await capacityOf([
      {
        Name: "core",
        Priority: 0,
        OverrideAction: { None: {} },
        Statement: {
          ManagedRuleGroupStatement: {
            VendorName: "AWS",
            Name: "AWSManagedRulesCommonRuleSet",
            ScopeDownStatement: byteMatch("EXACTLY"),
          },
        },
        VisibilityConfig: simWafVisibilityConfig,
      },
    ]);

    // Then the group costs its own fixed capacity, and the scope-down
    // statement is charged on top.
    assertIdentical(capacity, 702);
  });

  it("charges a rate limit its base cost and its scope-down statement", async () => {
    // Given a rule limiting the rate of requests to one path.
    const capacity = await capacityOf([
      ruleWith({
        RateBasedStatement: {
          Limit: 100,
          AggregateKeyType: "IP",
          ScopeDownStatement: byteMatch("EXACTLY"),
        },
      }),
    ]);

    // Then the counting costs two, and the scope-down statement is charged on
    // top of it as it is for a managed rule group.
    assertIdentical(capacity, 4);
  });

  it("adds up the rules of a whole web ACL", async () => {
    // Given a web ACL of two rules.
    const capacity = await capacityOf([
      ruleWith(byteMatch("EXACTLY")),
      {
        ...ruleWith(byteMatch("CONTAINS")),
        Name: "block-contains",
        Priority: 1,
      },
    ]);

    // Then it costs the sum of them, which is an upper bound on what AWS
    // charges: real WAF discounts whatever work two rules can share.
    assertIdentical(capacity, 12);
  });
});

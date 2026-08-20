import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { simWafCreateWebAclFactory } from "../command/web-acl/sim-waf-create-web-acl.factory.js";
import { SimWafInvalidParameterException } from "../error/sim-wafv2.error.js";
import { createSimWafWebAcl } from "../sim-wafv2.fixture.js";
import { simWafRuleFactory } from "../web-acl/sim-waf-rule.factory.js";
import type { SimWafRateBasedStatementInput } from "./sim-waf-rate-based.type.js";
import type { SimWafStatementInput } from "./sim-waf-statement.type.js";

/**
 * Try to create a web ACL whose one rule carries a statement, and answer with
 * what it was refused for.
 */
async function refusalForStatement(
  statement: SimWafStatementInput,
): Promise<Error> {
  return await assertThrowsErrorAsync(async () => {
    await createSimWafWebAcl(
      new SimAws().wafV2(),
      simWafCreateWebAclFactory.make({
        Rules: [
          {
            ...simWafRuleFactory.make({ Name: "sign-up-rate" }),
            Statement: statement,
          },
        ],
      }),
    );
  });
}

/**
 * Try to create a web ACL holding one rate limiting rule.
 */
async function refusalForRateStatement(
  statement: SimWafRateBasedStatementInput,
): Promise<Error> {
  return await refusalForStatement({ RateBasedStatement: statement });
}

describe("SimWafV2 rate based refusals", () => {
  it("refuses a limit real WAF would refuse", async () => {
    // When a rule limits a client to fewer requests than AWS allows.
    const tooFew = await refusalForRateStatement({
      Limit: 9,
      AggregateKeyType: "IP",
    });
    const none = await refusalForRateStatement({ AggregateKeyType: "IP" });

    // Then both are refused where the rule is written, naming the rule.
    assertInstanceOf(tooFew, SimWafInvalidParameterException);
    assertStringIncludes(tooFew.message, "sign-up-rate");
    assertStringIncludes(tooFew.message, "10");
    assertInstanceOf(none, SimWafInvalidParameterException);
    assertStringIncludes(none.message, "Limit");
  });

  it("refuses a window outside the four AWS counts over", async () => {
    // When a rule counts over a window of its own choosing.
    const error = await refusalForRateStatement({
      Limit: 100,
      EvaluationWindowSec: 90,
      AggregateKeyType: "IP",
    });

    // Then it is refused, naming the windows that are there.
    assertInstanceOf(error, SimWafInvalidParameterException);
    assertStringIncludes(error.message, "60, 120, 300, 600");
  });

  it("refuses an aggregation key type real WAF does not have", async () => {
    // When a rule aggregates on something that is not an aggregation key type.
    const error = await refusalForRateStatement({
      Limit: 100,
      AggregateKeyType: "SESSION",
    });

    // Then it is refused, naming what this simulation does count by.
    assertInstanceOf(error, SimWafInvalidParameterException);
    assertStringIncludes(error.message, "IP or CONSTANT");
  });

  it("refuses aggregating on CONSTANT with nothing to scope it down", async () => {
    // When a rule counts every request together and says nothing about which
    // requests it means.
    const error = await refusalForRateStatement({
      Limit: 100,
      AggregateKeyType: "CONSTANT",
    });

    // Then it is refused, as AWS refuses it. The rule would otherwise limit
    // everything the web ACL serves.
    assertInstanceOf(error, SimWafInvalidParameterException);
    assertStringIncludes(error.message, "ScopeDownStatement");
  });

  it("refuses a rate based statement nested inside another one", async () => {
    // When a rule joins a rate limit to another statement.
    const error = await refusalForStatement({
      AndStatement: {
        Statements: [
          { RateBasedStatement: { Limit: 100, AggregateKeyType: "IP" } },
          {
            ByteMatchStatement: {
              FieldToMatch: { UriPath: {} },
              PositionalConstraint: "STARTS_WITH",
              SearchString: "/signup",
              TextTransformations: [{ Priority: 0, Type: "NONE" }],
            },
          },
        ],
      },
    });

    // Then it is refused, as it is on AWS. A nested rate limit would count
    // only the requests that reached it rather than the rate the rule is
    // about, and a scope-down statement is how a rate limit narrows what it
    // counts.
    assertInstanceOf(error, SimWafInvalidParameterException);
    assertStringIncludes(error.message, "whole of a rule's statement");
  });
});

import { assertArrayEquals, assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimWafDecision } from "../evaluate/sim-waf-decision.js";
import {
  type SimWafRequestDecision,
  simWafWebAclDecisions,
} from "../sim-wafv2.fixture.js";
import type { SimWafRuleInput } from "../web-acl/sim-waf-rule.type.js";
import { simWafRuleFactory } from "../web-acl/sim-waf-rule.factory.js";
import type { SimWafRateBasedStatementInput } from "./sim-waf-rate-based.type.js";
import type { SimWafStatementInput } from "./sim-waf-statement.type.js";

/**
 * A statement claiming the requests that ask to create an account.
 */
const signUpPath: SimWafStatementInput = {
  ByteMatchStatement: {
    FieldToMatch: { UriPath: {} },
    PositionalConstraint: "STARTS_WITH",
    SearchString: "/signup",
    TextTransformations: [{ Priority: 0, Type: "NONE" }],
  },
};

/**
 * A rule limiting how many requests one client may make.
 */
function rateRule(
  statement: SimWafRateBasedStatementInput,
  rule: Partial<SimWafRuleInput> = {},
): SimWafRuleInput {
  return {
    ...simWafRuleFactory.make({ Name: "sign-up-rate", Priority: 0 }),
    ...rule,
    Statement: { RateBasedStatement: statement },
  };
}

/**
 * Make a run of requests to one path, in the order they arrive.
 */
function requests(
  decide: SimWafRequestDecision,
  count: number,
  path: string,
): readonly SimWafDecision[] {
  return Array.from({ length: count }, () =>
    decide(new Request(`https://example.test${path}`)),
  );
}

/**
 * What a web ACL holding one rate limiting rule does with requests.
 */
async function rateLimited(
  simAws: SimAws,
  statement: SimWafRateBasedStatementInput,
): Promise<SimWafRequestDecision> {
  return await simWafWebAclDecisions(simAws.wafV2(), [rateRule(statement)]);
}

describe("SimWafV2 rate based statements", () => {
  it("applies the rule's action once a client goes over the limit", async () => {
    // Given a web ACL blocking a client that makes more than ten requests.
    const decide = await rateLimited(new SimAws(), {
      Limit: 10,
      AggregateKeyType: "IP",
    });

    // When eleven requests arrive.
    const decisions = requests(decide, 11, "/signup");

    // Then the ten within the limit carried on to the default action, and the
    // one that went over it was blocked by the rule.
    assertArrayEquals(
      decisions.slice(0, 10).map((decision) => decision.action),
      Array.from({ length: 10 }, () => "ALLOW"),
    );
    assertIdentical(decisions[10]?.action, "BLOCK");
    assertIdentical(decisions[10].terminatingRuleName, "sign-up-rate");
  });

  it("counts only what a scope down statement claims", async () => {
    // Given a rate limit that only counts requests to the sign-up page.
    const decide = await rateLimited(new SimAws(), {
      Limit: 10,
      AggregateKeyType: "IP",
      ScopeDownStatement: signUpPath,
    });

    // When eleven requests go to another page and eleven to the sign-up page.
    const elsewhere = requests(decide, 11, "/login");
    const signUps = requests(decide, 11, "/signup");

    // Then the other page was never counted and is never limited, and the
    // sign-up page is limited on the request that went over.
    assertIdentical(elsewhere[10]?.action, "ALLOW");
    assertIdentical(signUps[10]?.action, "BLOCK");
  });

  it("counts requests together when it aggregates on CONSTANT", async () => {
    // Given a rate limit counting every sign-up together rather than by
    // client.
    const decide = await rateLimited(new SimAws(), {
      Limit: 10,
      AggregateKeyType: "CONSTANT",
      ScopeDownStatement: signUpPath,
    });

    // When eleven requests arrive.
    const decisions = requests(decide, 11, "/signup");

    // Then the one that went over the limit was blocked.
    assertIdentical(decisions[10]?.action, "BLOCK");
  });

  it("drops what it counted once the window has passed", async () => {
    // Given a client that has been limited on the sign-up page.
    const simAws = new SimAws();
    const decide = await rateLimited(simAws, {
      Limit: 10,
      EvaluationWindowSec: 300,
      AggregateKeyType: "IP",
    });

    assertIdentical(requests(decide, 11, "/signup")[10]?.action, "BLOCK");

    // When the simulated clock moves past the evaluation window.
    await simAws.clock().advanceBy({ minutes: 6 });

    // Then nothing it counted is still in the window, and the client is served
    // again.
    assertIdentical(requests(decide, 1, "/signup")[0]?.action, "ALLOW");
  });

  it("counts over the window the rule names", async () => {
    // Given two rate limits over the same traffic, one counting over a minute
    // and one over the five minutes AWS counts over when a rule names no
    // window.
    const simAws = new SimAws();
    const perMinute = await rateLimited(simAws, {
      Limit: 10,
      EvaluationWindowSec: 60,
      AggregateKeyType: "IP",
    });
    const byDefault = await rateLimited(simAws, {
      Limit: 10,
      AggregateKeyType: "IP",
    });

    requests(perMinute, 11, "/signup");
    requests(byDefault, 11, "/signup");

    // When the clock moves ninety seconds on.
    await simAws.clock().advanceBy({ seconds: 90 });

    // Then the shorter window has forgotten what it counted and the longer one
    // has not.
    assertIdentical(requests(perMinute, 1, "/signup")[0]?.action, "ALLOW");
    assertIdentical(requests(byDefault, 1, "/signup")[0]?.action, "BLOCK");
  });

  it("records the match and carries on when the action is Count", async () => {
    // Given a rate limit staged in count mode, over a rule that blocks the
    // page outright.
    const decide = await simWafWebAclDecisions(new SimAws().wafV2(), [
      rateRule(
        { Limit: 10, AggregateKeyType: "IP", ScopeDownStatement: signUpPath },
        { Action: { Count: {} } },
      ),
      {
        ...simWafRuleFactory.make({ Name: "block-signup", Priority: 1 }),
        Statement: signUpPath,
      },
    ]);

    // When eleven requests arrive.
    const decisions = requests(decide, 11, "/signup");

    // Then the rate limit recorded the one that went over and left the rule
    // behind it to decide, which is what staging a limit before turning it on
    // is for.
    assertArrayEquals(decisions[10]?.countedRuleNames ?? [], ["sign-up-rate"]);
    assertIdentical(decisions[10]?.terminatingRuleName, "block-signup");
  });

  it("counts from nothing again when the rules are written over", async () => {
    // Given a client that has been limited on the sign-up page.
    const simAws = new SimAws();
    const decide = await rateLimited(simAws, {
      Limit: 10,
      AggregateKeyType: "IP",
    });

    assertIdentical(requests(decide, 11, "/signup")[10]?.action, "BLOCK");

    // When the same rule is written over the web ACL by UpdateWebACL.
    const [webAcl] = simAws.wafV2().allWebAcls("REGIONAL");

    await simAws.wafV2().updateWebAcl({
      input: {
        Name: webAcl?.name,
        Scope: "REGIONAL",
        Id: webAcl?.id,
        LockToken: webAcl?.lockToken,
        DefaultAction: { Allow: {} },
        VisibilityConfig: { MetricName: "sim" },
        Rules: [rateRule({ Limit: 10, AggregateKeyType: "IP" })],
      },
    });

    // Then the counts went with the rules they belonged to, as they do on AWS.
    assertIdentical(requests(decide, 1, "/signup")[0]?.action, "ALLOW");
  });
});

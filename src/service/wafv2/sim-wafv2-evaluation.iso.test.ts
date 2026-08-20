import {
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertResponseStatus,
  assertStringIncludes,
  assertThrowsError,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";
import { simWafCreateWebAclFactory } from "./command/web-acl/sim-waf-create-web-acl.factory.js";
import type { SimCreateWebAclCommandInput } from "./command/web-acl/web-acl.command.js";
import { SimWafNonexistentItemException } from "./error/sim-wafv2.error.js";
import { simWafBlockedHttpResponse } from "./evaluate/sim-waf-blocked-response.js";
import type { SimWafDecision } from "./evaluate/sim-waf-decision.js";
import { simWafInspectedRequest } from "./evaluate/sim-waf-inspected-request.js";
import { createSimWafWebAcl } from "./sim-wafv2.fixture.js";
import type { SimWafRuleInput } from "./web-acl/sim-waf-rule.type.js";
import { simWafRuleFactory } from "./web-acl/sim-waf-rule.factory.js";

/**
 * A rule claiming every request whose path holds one string.
 */
function pathRule(
  name: string,
  priority: number,
  path: string,
  action: SimWafRuleInput["Action"],
): SimWafRuleInput {
  return {
    ...simWafRuleFactory.make({ Name: name, Priority: priority }),
    Action: action,
    Statement: {
      ByteMatchStatement: {
        SearchString: path,
        PositionalConstraint: "CONTAINS",
        FieldToMatch: { UriPath: {} },
        TextTransformations: [{ Priority: 0, Type: "NONE" }],
      },
    },
  };
}

/**
 * Put one request through a web ACL made of the given rules.
 */
async function decide(
  rules: readonly SimWafRuleInput[],
  path: string,
  webAcl: Partial<SimCreateWebAclCommandInput> = {},
): Promise<SimWafDecision> {
  const waf = new SimAws().wafV2();
  const created = await createSimWafWebAcl(waf, {
    ...simWafCreateWebAclFactory.make(),
    ...webAcl,
    Rules: rules,
  });

  return waf.evaluateRequest({
    webAclArn: created.ARN,
    request: new Request(`https://example.test${path}`),
  });
}

describe("SimWafV2 rule evaluation", () => {
  it("lets the first terminating match decide, in priority order", async () => {
    // Given two rules that both claim the request, the allowing one at the
    // lower priority and written last.
    const rules = [
      pathRule("block-admin", 10, "/admin", { Block: {} }),
      pathRule("allow-health", 1, "/admin", { Allow: {} }),
    ];

    // When a request both rules claim is evaluated.
    const decision = await decide(rules, "/admin");

    // Then the lower priority decided it, whatever order the rules were
    // written in.
    assertIdentical(decision.action, "ALLOW");
    assertIdentical(decision.terminatingRuleName, "allow-health");
  });

  it("gives a request no rule claims the default action", async () => {
    // Given a web ACL that blocks one path and allows by default.
    const rules = [pathRule("block-admin", 0, "/admin", { Block: {} })];

    // When a request outside that path is evaluated.
    const decision = await decide(rules, "/public");

    // Then the default action decided, and no rule is named as having done it.
    assertIdentical(decision.action, "ALLOW");
    assertUndefined(decision.terminatingRuleName);
  });

  it("blocks by default when the default action says so", async () => {
    // Given a web ACL whose default action blocks.
    const decision = await decide([], "/anything", {
      DefaultAction: { Block: {} },
    });

    // Then a request no rule claimed is blocked.
    assertIdentical(decision.action, "BLOCK");
    assertIdentical(decision.blocked?.statusCode, 403);
  });

  it("records a count match and carries on to the next rule", async () => {
    // Given a rule in count mode ahead of one that blocks.
    const rules = [
      pathRule("watch-admin", 0, "/admin", { Count: {} }),
      pathRule("block-admin", 1, "/admin", { Block: {} }),
    ];

    // When a request both claim is evaluated.
    const decision = await decide(rules, "/admin");

    // Then the count was recorded and the rule after it decided, which is what
    // staging a rule before turning it on looks like.
    assertArrayEquals(decision.countedRuleNames, ["watch-admin"]);
    assertIdentical(decision.terminatingRuleName, "block-admin");
    assertIdentical(decision.action, "BLOCK");
  });

  it("counts a match and still reaches the default action", async () => {
    // Given only a counting rule.
    const rules = [pathRule("watch-admin", 0, "/admin", { Count: {} })];

    // When a request it claims is evaluated.
    const decision = await decide(rules, "/admin");

    // Then the request was allowed by the default action, with the match on
    // record.
    assertArrayEquals(decision.countedRuleNames, ["watch-admin"]);
    assertIdentical(decision.action, "ALLOW");
    assertUndefined(decision.terminatingRuleName);
  });

  it("answers a blocked request with WAF's own 403", async () => {
    // Given a web ACL that blocks a path.
    const rules = [pathRule("block-admin", 0, "/admin", { Block: {} })];

    // When a request it claims is evaluated and answered.
    const decision = await decide(rules, "/admin");

    assertNonNullable(decision.blocked);

    const response = simWafBlockedHttpResponse(decision.blocked);

    // Then it is a 403 carrying WAF's own body.
    assertResponseStatus(response, 403);
    assertIdentical(response.headers.get("content-type"), "text/html");
    assertStringIncludes(await response.text(), "403 Forbidden");
  });

  it("answers with the custom response a block action named", async () => {
    // Given a web ACL holding a custom response body, and a rule that answers
    // with it.
    const rules = [
      pathRule("block-admin", 0, "/admin", {
        Block: {
          CustomResponse: {
            ResponseCode: 429,
            CustomResponseBodyKey: "slow-down",
            ResponseHeaders: [{ Name: "reason", Value: "too-many" }],
          },
        },
      }),
    ];

    // When a request it claims is evaluated.
    const decision = await decide(rules, "/admin", {
      CustomResponseBodies: {
        "slow-down": {
          ContentType: "APPLICATION_JSON",
          Content: '{"message":"slow down"}',
        },
      },
    });

    assertNonNullable(decision.blocked);

    const response = simWafBlockedHttpResponse(decision.blocked);

    // Then the status, the body and the header the rule named all reach the
    // client, with WAF's own prefix on the header name.
    assertResponseStatus(response, 429);
    assertIdentical(response.headers.get("x-amzn-waf-reason"), "too-many");
    assertIdentical(await response.text(), '{"message":"slow down"}');
  });

  it("keeps WAF's own body when a custom response only sets the status", async () => {
    // Given a rule that blocks with a status of its own and no body.
    const rules = [
      pathRule("block-admin", 0, "/admin", {
        Block: { CustomResponse: { ResponseCode: 503 } },
      }),
    ];

    // When a request it claims is evaluated.
    const decision = await decide(rules, "/admin");

    // Then the status is the rule's and the body is still WAF's own.
    assertNonNullable(decision.blocked);
    assertIdentical(decision.blocked.statusCode, 503);
    assertStringIncludes(decision.blocked.body, "403 Forbidden");
  });

  it("answers with an empty custom body when the web ACL holds one", async () => {
    // Given a web ACL holding a body with a content type and no content.
    const rules = [
      pathRule("block-admin", 0, "/admin", {
        Block: {
          CustomResponse: { CustomResponseBodyKey: "silence" },
        },
      }),
    ];

    // When a request it claims is evaluated.
    const decision = await decide(rules, "/admin", {
      CustomResponseBodies: { silence: { ContentType: "TEXT_PLAIN" } },
    });

    // Then the answer carries that content type and nothing in it.
    assertNonNullable(decision.blocked);
    assertIdentical(decision.blocked.contentType, "text/plain");
    assertIdentical(decision.blocked.body, "");
  });

  it("carries the headers an allow action asked to insert", async () => {
    // Given a rule that allows and asks for a header on the way through.
    const rules = [
      pathRule("allow-admin", 0, "/admin", {
        Allow: {
          CustomRequestHandling: {
            InsertHeaders: [{ Name: "checked" }],
          },
        },
      }),
    ];

    // When a request it claims is evaluated.
    const decision = await decide(rules, "/admin");

    // Then the header is on the decision, for whatever forwards the request to
    // add, under the prefix WAF puts on every header it inserts.
    assertArrayEquals(
      decision.insertedHeaders.map((header) => header.name),
      ["x-amzn-waf-checked"],
    );
    assertArrayEquals(
      decision.insertedHeaders.map((header) => header.value),
      [""],
    );
  });

  it("inserts no headers into a request it blocks", async () => {
    // Given a counting rule that asks for a header, ahead of one that blocks.
    const rules = [
      pathRule("watch-admin", 0, "/admin", {
        Count: {
          CustomRequestHandling: {
            InsertHeaders: [{ Name: "watched", Value: "yes" }],
          },
        },
      }),
      pathRule("block-admin", 1, "/admin", { Block: {} }),
    ];

    // When a request both claim is evaluated.
    const decision = await decide(rules, "/admin");

    // Then nothing is inserted, because nothing is forwarded.
    assertArrayLength(decision.insertedHeaders, 0);
  });

  it("names the web ACL that decided", async () => {
    // Given a web ACL with a name of its own.
    const waf = new SimAws().wafV2();
    const created = await createSimWafWebAcl(
      waf,
      simWafCreateWebAclFactory.make({ Name: "api-acl" }),
    );

    // When a request is evaluated against it.
    const webAcl = waf.findWebAclByArn(created.ARN);

    assertNonNullable(webAcl);

    const request = simWafInspectedRequest(
      new Request("https://example.test/"),
    );
    const decision = webAcl.evaluate(request);

    // Then the decision says which web ACL reached it, which matters once a
    // request can meet more than one.
    assertIdentical(decision.webAclName, "api-acl");
    assertIdentical(decision.webAclArn, created.ARN);
  });

  it("refuses to evaluate against a web ACL that is not there", () => {
    // Given a simulated WAFv2 with nothing in it.
    const waf = new SimAws().wafV2();

    // When a request is evaluated against an ARN naming no web ACL.
    const error = assertThrowsError(() => {
      waf.evaluateRequest({
        webAclArn: "arn:aws:wafv2:eu-west-2:111111111111:regional/webacl/x/y",
        request: new Request("https://example.test/"),
      });
    });

    // Then it is refused rather than quietly allowing the request.
    assertInstanceOf(error, SimWafNonexistentItemException);
  });
});

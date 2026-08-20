import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";
import { simWafCreateWebAclFactory } from "./command/web-acl/sim-waf-create-web-acl.factory.js";
import type { SimCreateWebAclCommandInput } from "./command/web-acl/web-acl.command.js";
import { SimWafInvalidParameterException } from "./error/sim-wafv2.error.js";
import {
  createSimWafWebAcl,
  simWafStatementMatches,
} from "./sim-wafv2.fixture.js";
import type { SimWafStatementInput } from "./statement/sim-waf-statement.type.js";
import type { SimWafRuleInput } from "./web-acl/sim-waf-rule.type.js";
import { simWafRuleFactory } from "./web-acl/sim-waf-rule.factory.js";

/**
 * Try to create a web ACL, and answer with what it was refused for.
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
  return await assertThrowsErrorAsync(async () => {
    await simWafStatementMatches(new SimAws().wafV2(), statement);
  });
}

describe("SimWafV2 input validation", () => {
  it("refuses a web ACL with no name", async () => {
    // When a web ACL is created with no name.
    const error = await refusalFor({ Name: undefined });

    // Then it is refused. A name is how a web ACL is read back.
    assertInstanceOf(error, SimWafInvalidParameterException);
  });

  it("refuses a scope it does not know", async () => {
    // When a web ACL names neither of the two scopes.
    const error = await refusalFor({ Scope: "EVERYWHERE" });

    assertInstanceOf(error, SimWafInvalidParameterException);
    assertStringIncludes(error.message, "EVERYWHERE");
  });

  it("refuses a listing limit outside the range WAFv2 allows", async () => {
    // Given a simulated WAFv2.
    const waf = new SimAws().wafV2();

    // When a listing asks for no items at all.
    const error = await assertThrowsErrorAsync(async () => {
      await waf.listWebAcls({ input: { Scope: "REGIONAL", Limit: 0 } });
    });

    assertInstanceOf(error, SimWafInvalidParameterException);
  });

  it("refuses a rule with no name, priority, statement or action", async () => {
    // When each of the four things a rule has to say is left out.
    const nameless = await refusalForRule({ Priority: 0 });
    const priorityless = await refusalForRule(
      simWafRuleFactory.make({ Name: "the-rule", Priority: 1.5 }),
    );
    const statementless = await refusalForRule({
      ...simWafRuleFactory.make({ Name: "the-rule" }),
      Statement: undefined,
    });
    const actionless = await refusalForRule({
      ...simWafRuleFactory.make({ Name: "the-rule" }),
      Action: {},
    });

    // Then each is refused rather than defaulted to something the rule did
    // not ask for.
    assertInstanceOf(nameless, SimWafInvalidParameterException);
    assertStringIncludes(priorityless.message, "Priority");
    assertStringIncludes(statementless.message, "needs a Statement");
    assertStringIncludes(actionless.message, "no action to take");
  });

  it("refuses a rule naming two actions", async () => {
    // When one rule both allows and blocks.
    const error = await refusalForRule({
      ...simWafRuleFactory.make({ Name: "the-rule" }),
      Action: { Allow: {}, Block: {} },
    });

    // Then it is refused, rather than the order they are checked in deciding
    // which one applies.
    assertInstanceOf(error, SimWafInvalidParameterException);
    assertStringIncludes(error.message, "one action");
  });

  it("refuses a web ACL whose default action counts", async () => {
    // When the default action is Count.
    const error = await refusalFor({ DefaultAction: { Count: {} } });

    // Then it is refused: a default action that counted would leave every
    // unmatched request unanswered.
    assertInstanceOf(error, SimWafInvalidParameterException);
    assertStringIncludes(error.message, "Allow or Block");
  });

  it("refuses a block action naming a response body the web ACL has not got", async () => {
    // When a rule answers with a body key naming nothing.
    const error = await refusalFor({
      Rules: [
        {
          ...simWafRuleFactory.make({ Name: "the-rule" }),
          Action: {
            Block: {
              CustomResponse: {
                ResponseCode: 404,
                CustomResponseBodyKey: "missing",
              },
            },
          },
        },
      ],
    });

    // Then it is refused, rather than answering with WAF's own body instead of
    // the one the rule named.
    assertInstanceOf(error, SimWafInvalidParameterException);
    assertStringIncludes(error.message, "missing");
  });

  it("refuses a custom header with no name", async () => {
    // When a rule inserts a header it did not name.
    const error = await refusalForRule({
      ...simWafRuleFactory.make({ Name: "the-rule" }),
      Action: { Allow: { CustomRequestHandling: { InsertHeaders: [{}] } } },
    });

    // Then it is refused, rather than inserting a header named after nothing.
    assertInstanceOf(error, SimWafInvalidParameterException);
    assertStringIncludes(error.message, "custom header");
  });

  it("refuses a custom response with no usable status", async () => {
    // When a block action names no status, or one outside the range WAF
    // answers with.
    const missing = await refusalForRule({
      ...simWafRuleFactory.make({ Name: "the-rule" }),
      Action: { Block: { CustomResponse: {} } },
    });
    const outOfRange = await refusalForRule({
      ...simWafRuleFactory.make({ Name: "the-rule" }),
      Action: { Block: { CustomResponse: { ResponseCode: 700 } } },
    });

    // Then both are refused, rather than answering with WAF's own 403 under a
    // rule that asked for something else.
    assertInstanceOf(missing, SimWafInvalidParameterException);
    assertStringIncludes(outOfRange.message, "200 to 599");
  });

  it("refuses a custom response setting its own content type", async () => {
    // When a block action carries a content-type header.
    const error = await refusalForRule({
      ...simWafRuleFactory.make({ Name: "the-rule" }),
      Action: {
        Block: {
          CustomResponse: {
            ResponseCode: 403,
            ResponseHeaders: [{ Name: "Content-Type", Value: "text/plain" }],
          },
        },
      },
    });

    // Then it is refused. The custom response body decides the content type,
    // and a header setting it again would contradict the body.
    assertInstanceOf(error, SimWafInvalidParameterException);
    assertStringIncludes(error.message, "content type");
  });

  it("refuses a rule at a negative priority", async () => {
    // When a rule asks to run before the first one.
    const error = await refusalForRule(
      simWafRuleFactory.make({ Name: "the-rule", Priority: -1 }),
    );

    // Then it is refused. Real WAF numbers rules from zero upwards.
    assertInstanceOf(error, SimWafInvalidParameterException);
    assertStringIncludes(error.message, "zero or more");
  });

  it("refuses a statement with nothing to match against", async () => {
    // When a statement names no field, or a field naming no part of a request.
    const fieldless = await refusalForStatement({
      ByteMatchStatement: {
        SearchString: "x",
        PositionalConstraint: "CONTAINS",
        TextTransformations: [{ Priority: 0, Type: "NONE" }],
      },
    });
    const emptyField = await refusalForStatement({
      ByteMatchStatement: {
        SearchString: "x",
        PositionalConstraint: "CONTAINS",
        FieldToMatch: {},
        TextTransformations: [{ Priority: 0, Type: "NONE" }],
      },
    });

    assertStringIncludes(fieldless.message, "FieldToMatch is required");
    assertStringIncludes(emptyField.message, "names no field");
  });

  it("refuses a byte match statement it cannot carry out", async () => {
    // When the search string or the positional constraint is missing.
    const searchless = await refusalForStatement({
      ByteMatchStatement: {
        PositionalConstraint: "CONTAINS",
        FieldToMatch: { UriPath: {} },
        TextTransformations: [{ Priority: 0, Type: "NONE" }],
      },
    });
    const constraintless = await refusalForStatement({
      ByteMatchStatement: {
        SearchString: "x",
        FieldToMatch: { UriPath: {} },
        TextTransformations: [{ Priority: 0, Type: "NONE" }],
      },
    });

    assertStringIncludes(searchless.message, "SearchString");
    assertStringIncludes(constraintless.message, "positional constraint");
  });

  it("refuses a size constraint it cannot carry out", async () => {
    // When the comparison or the size is missing.
    const comparisonless = await refusalForStatement({
      SizeConstraintStatement: {
        Size: 1,
        FieldToMatch: { UriPath: {} },
        TextTransformations: [{ Priority: 0, Type: "NONE" }],
      },
    });
    const sizeless = await refusalForStatement({
      SizeConstraintStatement: {
        ComparisonOperator: "GT",
        FieldToMatch: { UriPath: {} },
        TextTransformations: [{ Priority: 0, Type: "NONE" }],
      },
    });

    assertStringIncludes(comparisonless.message, "comparison operator");
    assertStringIncludes(sizeless.message, "needs a Size");
  });

  it("refuses a regular expression statement with nothing to match", async () => {
    // When the expression or the pattern set ARN is missing.
    const patternless = await refusalForStatement({
      RegexMatchStatement: {
        FieldToMatch: { UriPath: {} },
        TextTransformations: [{ Priority: 0, Type: "NONE" }],
      },
    });
    const arnless = await refusalForStatement({
      RegexPatternSetReferenceStatement: {
        FieldToMatch: { UriPath: {} },
        TextTransformations: [{ Priority: 0, Type: "NONE" }],
      },
    });

    assertStringIncludes(patternless.message, "RegexString");
    assertStringIncludes(arnless.message, "an ARN");
  });

  it("refuses a field to match that is missing what it needs", async () => {
    // When a named field has no name, a header set no match scope, and a body
    // an oversize handling WAF does not offer.
    const unnamed = await refusalForStatement(
      byteMatch({ SingleHeader: { Name: "" } }),
    );
    const scopeless = await refusalForStatement(
      byteMatch({
        Headers: { MatchPattern: { All: {} }, OversizeHandling: "CONTINUE" },
      }),
    );
    const oversize = await refusalForStatement(
      byteMatch({ Body: { OversizeHandling: "IGNORE" } }),
    );

    assertStringIncludes(unnamed.message, "needs a Name");
    assertStringIncludes(scopeless.message, "match scope");
    assertStringIncludes(oversize.message, "oversize handling");
  });

  it("refuses the remaining field kinds it does not read", async () => {
    // When a rule reads the header order or a URI fragment.
    const headerOrder = await refusalForStatement(
      byteMatch({ HeaderOrder: { OversizeHandling: "CONTINUE" } }),
    );
    const fragment = await refusalForStatement(
      byteMatch({ UriFragment: { FallbackBehavior: "NO_MATCH" } }),
    );
    const ja3 = await refusalForStatement(
      byteMatch({ JA3Fingerprint: { FallbackBehavior: "NO_MATCH" } }),
    );

    assertStringIncludes(headerOrder.message, "HeaderOrder");
    assertStringIncludes(fragment.message, "UriFragment");
    assertStringIncludes(ja3.message, "JA3Fingerprint");
  });
});

/**
 * A byte match statement pointed at whichever field the test is about.
 */
function byteMatch(field: unknown): SimWafStatementInput {
  return {
    ByteMatchStatement: {
      SearchString: "x",
      PositionalConstraint: "CONTAINS",
      FieldToMatch: field as Record<string, never>,
      TextTransformations: [{ Priority: 0, Type: "NONE" }],
    },
  };
}

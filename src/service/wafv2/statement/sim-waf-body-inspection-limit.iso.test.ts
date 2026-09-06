import {
  assertFalse,
  assertIdentical,
  assertObjectEquals,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { simWafCreateWebAclFactory } from "../command/web-acl/sim-waf-create-web-acl.factory.js";
import type { SimCreateWebAclCommandInput } from "../command/web-acl/web-acl.command.js";
import { createSimWafWebAcl } from "../sim-wafv2.fixture.js";
import type { SimWafV2 } from "../sim-wafv2.js";
import type { SimWafBodyInspectionResourceType } from "../web-acl/sim-waf-association-config.js";
import { simWafRuleFactory } from "../web-acl/sim-waf-rule.factory.js";
import type { SimWafFieldToMatchInput } from "./sim-waf-field-to-match.type.js";
import { simWafHeaderInspectionLimitBytes } from "./sim-waf-field-content.js";
import type { SimWafStatementInput } from "./sim-waf-statement.type.js";

const encoder = new TextEncoder();

const kilobytes = 1024;

/**
 * A statement looking for one string in whichever field it is pointed at.
 */
function contains(
  searchString: string,
  field: SimWafFieldToMatchInput,
): SimWafStatementInput {
  return {
    ByteMatchStatement: {
      SearchString: searchString,
      PositionalConstraint: "CONTAINS",
      FieldToMatch: field,
      TextTransformations: [{ Priority: 0, Type: "NONE" }],
    },
  };
}

/**
 * A body of one size with the search string at the very end of it.
 *
 * A rule only finds the needle when WAF read the whole body, which is what
 * makes the size the thing under test.
 */
function bodyEndingIn(needle: string, sizeBytes: number): Uint8Array {
  return encoder.encode(`${"x".repeat(sizeBytes - needle.length)}${needle}`);
}

/**
 * Put requests through a web ACL holding one blocking rule.
 *
 * The resource type is the one the request reached, which is what decides how
 * much of its body the rule reads.
 */
async function blocksRequest(
  simWaf: SimWafV2,
  statement: SimWafStatementInput,
  webAcl: Partial<SimCreateWebAclCommandInput> = {},
): Promise<
  (body: Uint8Array, resourceType?: SimWafBodyInspectionResourceType) => boolean
> {
  const { ARN: webAclArn } = await createSimWafWebAcl(simWaf, {
    ...simWafCreateWebAclFactory.make(),
    ...webAcl,
    Rules: [{ ...simWafRuleFactory.make(), Statement: statement }],
  });

  return (body, resourceType): boolean =>
    simWaf.evaluateRequest({
      webAclArn,
      request: new Request("https://example.test/", { method: "POST" }),
      body,
      resourceType,
    }).action === "BLOCK";
}

describe("SimWafV2 body inspection limit", () => {
  it("reads 16 KB of a body, which is what every protected resource type reads", async () => {
    // Given a rule looking for a string at the end of a 12 KB body, which is
    // past the 8 KB an Application Load Balancer would have stopped at.
    const blocks = await blocksRequest(
      new SimAws().wafV2(),
      contains("needle", { Body: { OversizeHandling: "CONTINUE" } }),
    );

    // Then WAF read that far, and the rule claims the request.
    assertTrue(blocks(bodyEndingIn("needle", 12 * kilobytes)));
  });

  it("treats a body as oversize only once it passes 16 KB", async () => {
    // Given a rule that blocks whatever it could not read.
    const blocks = await blocksRequest(
      new SimAws().wafV2(),
      contains("needle", { Body: { OversizeHandling: "MATCH" } }),
    );

    // Then a 12 KB body is inspected and goes through, and a 20 KB body is the
    // one the rule refuses to let past unread.
    const inspected = encoder.encode("x".repeat(12 * kilobytes));
    const oversize = encoder.encode("x".repeat(20 * kilobytes));

    assertFalse(blocks(inspected));
    assertTrue(blocks(oversize));
  });

  it("reads as far as the AssociationConfig for the resource type says", async () => {
    // Given a web ACL raising the CloudFront body limit to 64 KB.
    const blocks = await blocksRequest(
      new SimAws().wafV2(),
      contains("needle", { Body: { OversizeHandling: "CONTINUE" } }),
      {
        Scope: "CLOUDFRONT",
        AssociationConfig: {
          RequestBody: { CLOUDFRONT: { DefaultSizeInspectionLimit: "KB_64" } },
        },
      },
    );

    // Then a 40 KB body reaching a distribution is read to the end.
    assertTrue(blocks(bodyEndingIn("needle", 40 * kilobytes), "CLOUDFRONT"));
  });

  it("raises the limit for the resource type the config keyed it under", async () => {
    // Given a web ACL raising the limit for a REST API stage alone.
    const blocks = await blocksRequest(
      new SimAws().wafV2(),
      contains("needle", { Body: { OversizeHandling: "CONTINUE" } }),
      {
        AssociationConfig: {
          RequestBody: {
            API_GATEWAY: { DefaultSizeInspectionLimit: "KB_48" },
          },
        },
      },
    );
    const body = bodyEndingIn("needle", 40 * kilobytes);

    // Then the stage reads the whole 40 KB body, and a user pool the same web
    // ACL is in front of stops at the default 16 KB.
    assertTrue(blocks(body, "API_GATEWAY"));
    assertFalse(blocks(body, "COGNITO_USER_POOL"));
  });

  it("holds a header set to 8 KB whatever the body limit is", async () => {
    // Given a web ACL raising the body limit as far as it goes.
    const simWaf = new SimAws().wafV2();
    const { ARN: webAclArn } = await createSimWafWebAcl(simWaf, {
      ...simWafCreateWebAclFactory.make(),
      AssociationConfig: {
        RequestBody: { API_GATEWAY: { DefaultSizeInspectionLimit: "KB_64" } },
      },
      Rules: [
        {
          ...simWafRuleFactory.make(),
          Statement: contains("needle", {
            Headers: {
              MatchPattern: { All: {} },
              MatchScope: "VALUE",
              OversizeHandling: "MATCH",
            },
          }),
        },
      ],
    });
    const headers = new Headers({
      "x-large": "y".repeat(simWafHeaderInspectionLimitBytes + 1),
    });

    // Then a header set over 8 KB is still more than WAF reads.
    assertIdentical(
      simWaf.evaluateRequest({
        webAclArn,
        request: new Request("https://example.test/", { headers }),
        resourceType: "API_GATEWAY",
      }).action,
      "BLOCK",
    );
  });

  it("reports the AssociationConfig a web ACL was written with", async () => {
    // Given a web ACL created with a raised body limit.
    const simWaf = new SimAws().wafV2();
    const associationConfig = {
      RequestBody: {
        COGNITO_USER_POOL: { DefaultSizeInspectionLimit: "KB_32" },
      },
    };
    const summary = await createSimWafWebAcl(simWaf, {
      ...simWafCreateWebAclFactory.make(),
      AssociationConfig: associationConfig,
    });

    // Then GetWebACL answers with it.
    const found = await simWaf.getWebAcl({
      input: { Name: summary.Name, Id: summary.Id, Scope: "REGIONAL" },
    });

    assertObjectEquals(found.WebACL?.AssociationConfig, associationConfig);
  });
});

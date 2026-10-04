import {
  assertArrayEquals,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";
import { simWafCreateWebAclFactory } from "./command/web-acl/sim-waf-create-web-acl.factory.js";
import { SimWafInvalidParameterException } from "./error/sim-wafv2.error.js";
import {
  createSimWafWebAcl,
  simWafHeldWebAcl,
  simWafUnsimulatedReason,
} from "./sim-wafv2.fixture.js";
import type { SimWafStatementInput } from "./statement/sim-waf-statement.type.js";
import type { SimWafRuleInput } from "./web-acl/sim-waf-rule.type.js";
import { simWafRuleFactory } from "./web-acl/sim-waf-rule.factory.js";

const blockingRule = (statement: SimWafStatementInput): SimWafRuleInput => ({
  ...simWafRuleFactory.make({ Name: "the-rule" }),
  Statement: statement,
});

const geoMatch: SimWafStatementInput = {
  GeoMatchStatement: { CountryCodes: ["CN"] },
};

describe("SimWafV2 web ACLs holding what it does not simulate", () => {
  it("passes a request a held rule would have claimed on to the next rule", async () => {
    // Given a held rule ahead of one that blocks every request.
    const waf = new SimAws().wafV2();
    const created = await createSimWafWebAcl(waf, {
      ...simWafCreateWebAclFactory.make(),
      Rules: [
        blockingRule(geoMatch),
        simWafRuleFactory.make({ Name: "everything", Priority: 1 }),
      ],
    });

    // When a request is evaluated.
    const decision = waf.evaluateRequest({
      webAclArn: created.ARN,
      request: new Request("https://example.com/"),
    });

    // Then the rule after it decides.
    assertIdentical(decision.terminatingRuleName, "everything");
  });

  it("holds an unsimulated rule written by UpdateWebACL", async () => {
    // Given a web ACL with nothing unsimulated in it.
    const waf = new SimAws().wafV2();
    const created = await createSimWafWebAcl(
      waf,
      simWafCreateWebAclFactory.make(),
    );
    const rule = blockingRule({
      SqliMatchStatement: {
        FieldToMatch: { UriPath: {} },
        TextTransformations: [{ Priority: 0, Type: "NONE" }],
      },
    });

    // When an update writes a rule Yulin cannot evaluate.
    await waf.updateWebAcl({
      input: {
        ...simWafCreateWebAclFactory.make({ Name: created.Name }),
        Id: created.Id,
        LockToken: created.LockToken,
        Rules: [rule],
      },
    });

    // Then the update is taken and the rule reported.
    assertArrayEquals(
      waf.unsimulatedParts(created.ARN).map(({ part }) => part),
      ["Rules.the-rule"],
    );
  });

  it("holds the web ACL members it does not model", async () => {
    // When a web ACL is written with members Yulin has no behaviour for.
    const members = {
      CaptchaConfig: { ImmunityTimeProperty: { ImmunityTime: 300 } },
      ChallengeConfig: { ImmunityTimeProperty: { ImmunityTime: 300 } },
      TokenDomains: ["example.com"],
    };
    const { webAcl, parts } = await simWafHeldWebAcl(
      new SimAws().wafV2(),
      members,
    );

    // Then GetWebACL returns each as written, and each is reported.
    assertIdentical(webAcl.CaptchaConfig, members.CaptchaConfig);
    assertIdentical(webAcl.TokenDomains, members.TokenDomains);
    assertArrayEquals(
      parts.map(({ part }) => part),
      ["CaptchaConfig", "ChallengeConfig", "TokenDomains"],
    );
    assertStringIncludes(
      simWafUnsimulatedReason(parts, "TokenDomains"),
      "browser",
    );
  });

  it("holds a body inspection limit for a resource type no request passes through", async () => {
    // When a web ACL sets the limit for App Runner.
    const associationConfig = {
      RequestBody: {
        APP_RUNNER_SERVICE: { DefaultSizeInspectionLimit: "KB_32" },
      },
    };
    const { webAcl, parts } = await simWafHeldWebAcl(new SimAws().wafV2(), {
      AssociationConfig: associationConfig,
    });

    // Then the limit is returned as written and reported.
    assertIdentical(webAcl.AssociationConfig, associationConfig);
    assertStringIncludes(
      simWafUnsimulatedReason(
        parts,
        "AssociationConfig.RequestBody.APP_RUNNER_SERVICE",
      ),
      "APP_RUNNER_SERVICE",
    );
  });

  it("holds the tags a web ACL is created with", async () => {
    // When a web ACL is created with tags.
    const { parts } = await simWafHeldWebAcl(new SimAws().wafV2(), {
      Tags: [{ Key: "Team", Value: "payments" }],
    });

    // Then they are reported as held with nothing reading them.
    assertStringIncludes(
      simWafUnsimulatedReason(parts, "Tags"),
      "ListTagsForResource",
    );
  });

  it("still refuses two rules at one priority when one of them is held", async () => {
    // Given a held rule and another at the same priority.
    const waf = new SimAws().wafV2();

    // When the web ACL is created.
    const error = await assertThrowsErrorAsync(async () => {
      await createSimWafWebAcl(waf, {
        ...simWafCreateWebAclFactory.make(),
        Rules: [
          blockingRule(geoMatch),
          simWafRuleFactory.make({ Name: "other", Priority: 0 }),
        ],
      });
    });

    // Then WAFv2's own refusal still applies.
    assertInstanceOf(error, SimWafInvalidParameterException);
    assertStringIncludes(error.message, "priority");
  });
});

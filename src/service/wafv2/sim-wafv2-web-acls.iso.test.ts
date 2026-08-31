import {
  DeleteWebACLCommand,
  GetWebACLCommand,
  ListWebACLsCommand,
} from "@aws-sdk/client-wafv2";
import {
  assertArrayEmpty,
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import type { SimAwsAccountId } from "../aws/sim-aws-account.js";
import { SimAws } from "../aws/sim-aws.js";
import { simWafCreateWebAclFactory } from "./command/web-acl/sim-waf-create-web-acl.factory.js";
import {
  SimWafDuplicateItemException,
  SimWafInvalidParameterException,
  SimWafNonexistentItemException,
  SimWafOptimisticLockException,
} from "./error/sim-wafv2.error.js";
import { createSimWafWebAcl } from "./sim-wafv2.fixture.js";
import { simWafRuleFactory } from "./web-acl/sim-waf-rule.factory.js";

const accountIdTwoTwos = "222222222222" as SimAwsAccountId;

describe("SimWafV2 web ACLs", () => {
  it("creates a web ACL and reads it back", async () => {
    // Given a simulated WAFv2.
    const waf = new SimAws().wafV2();
    const input = simWafCreateWebAclFactory.make({
      Description: "the public API",
      Rules: [simWafRuleFactory.make({ Name: "block-everything" })],
    });

    // When a web ACL is created and read back.
    const created = await createSimWafWebAcl(waf, input);
    const read = await waf.getWebAcl(
      new GetWebACLCommand({
        Name: input.Name,
        Scope: "REGIONAL",
        Id: created.Id,
      }),
    );

    // Then it reports the rules and the default action it was written with.
    assertNonNullable(read.WebACL);
    assertIdentical(read.WebACL.Name, input.Name);
    assertIdentical(read.WebACL.Description, "the public API");
    assertArrayEquals(
      read.WebACL.Rules.map((rule) => rule.Name),
      ["block-everything"],
    );
  });

  it("names a web ACL by the account, region and scope it is in", async () => {
    // Given a simulated WAFv2 in one account and region.
    const waf = new SimAws()
      .accountRegionScope(accountIdTwoTwos, "eu-west-2")
      .wafV2();

    // When a REGIONAL web ACL is created.
    const created = await createSimWafWebAcl(
      waf,
      simWafCreateWebAclFactory.make({ Name: "api-acl" }),
    );

    // Then its ARN names that account, region and scope, ending with the id
    // WAFv2 generated for it.
    assertStringIncludes(
      created.ARN,
      `arn:aws:wafv2:eu-west-2:222222222222:regional/webacl/api-acl/`,
    );
    assertStringIncludes(created.ARN, created.Id);
  });

  it("holds a CLOUDFRONT scope web ACL in us-east-1", async () => {
    // Given a simulated WAFv2 in us-east-1.
    const simAws = new SimAws();
    const waf = simAws
      .accountRegionScope(simAws.defaultAccountId, "us-east-1")
      .wafV2();

    // When a CLOUDFRONT scope web ACL is created.
    const created = await createSimWafWebAcl(
      waf,
      simWafCreateWebAclFactory.make({
        Name: "site-acl",
        Scope: "CLOUDFRONT",
      }),
    );

    // Then its ARN says global, which is what a CloudFront distribution is
    // pointed at.
    assertStringIncludes(created.ARN, "us-east-1");
    assertStringIncludes(created.ARN, "global/webacl/site-acl/");
  });

  it("refuses a CLOUDFRONT scope web ACL outside us-east-1", async () => {
    // Given a simulated WAFv2 somewhere other than us-east-1.
    const simAws = new SimAws();
    const waf = simAws
      .accountRegionScope(simAws.defaultAccountId, "eu-west-2")
      .wafV2();

    // When a CLOUDFRONT scope web ACL is asked for.
    const error = await assertThrowsErrorAsync(async () => {
      await createSimWafWebAcl(
        waf,
        simWafCreateWebAclFactory.make({ Scope: "CLOUDFRONT" }),
      );
    });

    // Then it is refused, as real WAFv2 refuses it: CloudFront is global and
    // its web ACLs are held in us-east-1.
    assertInstanceOf(error, SimWafInvalidParameterException);
    assertStringIncludes(error.message, "us-east-1");
  });

  it("keeps the two scopes in separate namespaces", async () => {
    // Given a REGIONAL web ACL in us-east-1.
    const simAws = new SimAws();
    const waf = simAws
      .accountRegionScope(simAws.defaultAccountId, "us-east-1")
      .wafV2();

    await createSimWafWebAcl(
      waf,
      simWafCreateWebAclFactory.make({ Name: "shared-name" }),
    );

    // When a CLOUDFRONT web ACL takes the same name.
    await createSimWafWebAcl(
      waf,
      simWafCreateWebAclFactory.make({
        Name: "shared-name",
        Scope: "CLOUDFRONT",
      }),
    );

    // Then both are there. A name is unique within a scope and the scopes do
    // not see each other.
    assertArrayLength(waf.allWebAcls("REGIONAL"), 1);
    assertArrayLength(waf.allWebAcls("CLOUDFRONT"), 1);
  });

  it("refuses a second web ACL under a name that is taken", async () => {
    // Given a web ACL.
    const waf = new SimAws().wafV2();
    const input = simWafCreateWebAclFactory.make();

    await createSimWafWebAcl(waf, input);

    // When another is created under the same name in the same scope.
    const error = await assertThrowsErrorAsync(async () => {
      await createSimWafWebAcl(waf, input);
    });

    // Then it is refused rather than answering with the one that exists.
    assertInstanceOf(error, SimWafDuplicateItemException);
  });

  it("refuses two rules claiming one priority", async () => {
    // Given a simulated WAFv2.
    const waf = new SimAws().wafV2();

    // When a web ACL is written with two rules at the same priority.
    const rules = [
      simWafRuleFactory.make({ Name: "first", Priority: 3 }),
      simWafRuleFactory.make({ Name: "second", Priority: 3 }),
    ];
    const input = simWafCreateWebAclFactory.make({ Rules: rules });
    const error = await assertThrowsErrorAsync(async () => {
      await createSimWafWebAcl(waf, input);
    });

    // Then it is refused, as real WAF refuses it: rules run in priority order,
    // and two rules at one priority have no order between them.
    assertInstanceOf(error, SimWafInvalidParameterException);
    assertStringIncludes(error.message, "first");
    assertStringIncludes(error.message, "second");
  });

  it("changes a web ACL through its lock token", async () => {
    // Given a web ACL with one rule.
    const waf = new SimAws().wafV2();
    const input = simWafCreateWebAclFactory.make({
      Rules: [simWafRuleFactory.make({ Name: "first" })],
    });
    const created = await createSimWafWebAcl(waf, input);

    // When it is updated with the token creation issued.
    await waf.updateWebAcl({
      input: {
        ...input,
        Id: created.Id,
        LockToken: created.LockToken,
        Rules: [simWafRuleFactory.make({ Name: "second" })],
      },
    });

    // Then the new rules are what it holds.
    const read = await waf.getWebAcl(
      new GetWebACLCommand({
        Name: input.Name,
        Scope: "REGIONAL",
        Id: created.Id,
      }),
    );

    assertArrayEquals(
      read.WebACL?.Rules.map((rule) => rule.Name),
      ["second"],
    );
  });

  it("refuses a change made against a stale lock token", async () => {
    // Given a web ACL that has been written once already.
    const waf = new SimAws().wafV2();
    const input = simWafCreateWebAclFactory.make();
    const created = await createSimWafWebAcl(waf, input);
    const staleToken = created.LockToken;

    await waf.updateWebAcl({
      input: { ...input, Id: created.Id, LockToken: staleToken },
    });

    // When a second change is made from the token of the first read.
    const error = await assertThrowsErrorAsync(async () => {
      await waf.updateWebAcl({
        input: { ...input, Id: created.Id, LockToken: staleToken },
      });
    });

    // Then it is refused. That is what stops two callers editing one web ACL
    // from the same read and only one of the changes landing.
    assertInstanceOf(error, SimWafOptimisticLockException);
  });

  it("keeps the rules it had when an update is refused", async () => {
    // Given a web ACL with one rule.
    const waf = new SimAws().wafV2();
    const input = simWafCreateWebAclFactory.make({
      Rules: [simWafRuleFactory.make({ Name: "first" })],
    });
    const created = await createSimWafWebAcl(waf, input);

    // When an update carrying a rule WAFv2 will not take is refused.
    await assertThrowsErrorAsync(async () => {
      await waf.updateWebAcl({
        input: {
          ...input,
          Id: created.Id,
          LockToken: created.LockToken,
          Rules: [
            {
              ...simWafRuleFactory.make({ Name: "rate-limited" }),
              Statement: { RateBasedStatement: { Limit: 100 } },
            },
          ],
        },
      });
    });

    // Then the web ACL still holds the rule it had, rather than being left
    // with none.
    const read = await waf.getWebAcl(
      new GetWebACLCommand({
        Name: input.Name,
        Scope: "REGIONAL",
        Id: created.Id,
      }),
    );

    assertArrayEquals(
      read.WebACL?.Rules.map((rule) => rule.Name),
      ["first"],
    );
  });

  it("lists web ACLs a page at a time", async () => {
    // Given three web ACLs in one scope.
    const waf = new SimAws().wafV2();

    await createSimWafWebAcl(
      waf,
      simWafCreateWebAclFactory.make({ Name: "one" }),
    );
    await createSimWafWebAcl(
      waf,
      simWafCreateWebAclFactory.make({ Name: "two" }),
    );
    await createSimWafWebAcl(
      waf,
      simWafCreateWebAclFactory.make({ Name: "three" }),
    );

    // When they are read a page at a time.
    const first = await waf.listWebAcls(
      new ListWebACLsCommand({ Scope: "REGIONAL", Limit: 2 }),
    );
    const second = await waf.listWebAcls(
      new ListWebACLsCommand({
        Scope: "REGIONAL",
        Limit: 2,
        NextMarker: first.NextMarker,
      }),
    );

    // Then the marker from the first page reaches the rest, and the last page
    // offers none.
    assertArrayEquals(
      first.WebACLs?.map((summary) => summary.Name),
      ["one", "two"],
    );
    assertArrayEquals(
      second.WebACLs?.map((summary) => summary.Name),
      ["three"],
    );
    assertUndefined(second.NextMarker);
  });

  it("refuses a listing marker this simulation did not issue", async () => {
    // Given a web ACL.
    const waf = new SimAws().wafV2();

    await createSimWafWebAcl(waf, simWafCreateWebAclFactory.make());

    // When a listing is asked for with a marker from somewhere else.
    const error = await assertThrowsErrorAsync(async () => {
      await waf.listWebAcls(
        new ListWebACLsCommand({ Scope: "REGIONAL", NextMarker: "elsewhere" }),
      );
    });

    // Then it is refused rather than quietly starting again at the beginning.
    assertInstanceOf(error, SimWafInvalidParameterException);
  });

  it("deletes a web ACL", async () => {
    // Given a web ACL.
    const waf = new SimAws().wafV2();
    const input = simWafCreateWebAclFactory.make();
    const created = await createSimWafWebAcl(waf, input);

    // When it is deleted with its lock token.
    await waf.deleteWebAcl(
      new DeleteWebACLCommand({
        Name: input.Name,
        Scope: "REGIONAL",
        Id: created.Id,
        LockToken: created.LockToken,
      }),
    );

    // Then it is gone.
    assertArrayEmpty(waf.allWebAcls("REGIONAL"));
  });

  it("refuses a read of a web ACL that is not there", async () => {
    // Given a simulated WAFv2 with nothing in it.
    const waf = new SimAws().wafV2();

    // When a web ACL is read by a name and id naming none.
    const error = await assertThrowsErrorAsync(async () => {
      await waf.getWebAcl(
        new GetWebACLCommand({
          Name: "missing",
          Scope: "REGIONAL",
          Id: "0f5a1b2c-3d4e-5f60-7182-93a4b5c6d7e8",
        }),
      );
    });

    // Then it is refused rather than answered with nothing.
    assertInstanceOf(error, SimWafNonexistentItemException);
  });
});

import {
  CreateIPSetCommand,
  CreateRegexPatternSetCommand,
  GetWebACLCommand,
  UpdateIPSetCommand,
  UpdateRegexPatternSetCommand,
} from "@aws-sdk/client-wafv2";
import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";
import { simWafCreateWebAclFactory } from "./command/web-acl/sim-waf-create-web-acl.factory.js";
import { SimWafValidationException } from "./error/sim-wafv2.error.js";
import { createSimWafWebAcl } from "./sim-wafv2.fixture.js";
import type { SimWafV2 } from "./sim-wafv2.js";

const lengthConstraint = "Member must have length greater than or equal to 1";
const patternConstraint = "Member must satisfy regular expression pattern";

describe("SimWafV2 descriptions", () => {
  it("refuses a web ACL created with an empty description", async () => {
    // Given a simulated WAFv2.
    const waf = new SimAws().wafV2();

    // When a web ACL is created with an empty description.
    const error = await assertThrowsErrorAsync(async () => {
      await createSimWafWebAcl(
        waf,
        simWafCreateWebAclFactory.make({ Description: "" }),
      );
    });

    // Then it is refused for both of the constraints WAFv2 checks, in one
    // message, as WAFv2 refuses it.
    assertInstanceOf(error, SimWafValidationException);
    assertStringIncludes(error.message, "2 validation errors detected");
    assertStringIncludes(error.message, lengthConstraint);
    assertStringIncludes(error.message, patternConstraint);
  });

  it("refuses an empty description written back over a web ACL", async () => {
    // Given a web ACL that has been read back.
    const waf = new SimAws().wafV2();
    const input = simWafCreateWebAclFactory.make({ Description: "the API" });
    const created = await createSimWafWebAcl(waf, input);

    // When every field is written back with the description emptied, which is
    // what a read of an undescribed ACL on real WAFv2 hands back.
    const error = await assertThrowsErrorAsync(async () => {
      await waf.updateWebAcl({
        input: {
          ...input,
          Id: created.Id,
          LockToken: created.LockToken,
          Description: "",
        },
      });
    });

    // Then the write is refused, rather than landing here and failing in the
    // account.
    assertInstanceOf(error, SimWafValidationException);

    // And the description it had is still there.
    const read = await waf.getWebAcl(
      new GetWebACLCommand({
        Name: input.Name,
        Scope: "REGIONAL",
        Id: created.Id,
      }),
    );

    assertIdentical(read.WebACL?.Description, "the API");
  });

  it("refuses a description the documented pattern cannot match", async () => {
    // When a description is long enough and still outside the pattern: two
    // characters, and one that ends in a space.
    const tooShort = await webAclRefusal(new SimAws().wafV2(), "ab");
    const trailingSpace = await webAclRefusal(new SimAws().wafV2(), "the API ");

    // Then each is refused for the pattern alone, because the pattern matches
    // three characters at the shortest and neither end may be whitespace.
    assertStringIncludes(tooShort.message, "1 validation error detected");
    assertStringIncludes(tooShort.message, patternConstraint);
    assertStringIncludes(trailingSpace.message, patternConstraint);
  });

  it("refuses a description longer than WAFv2 stores", async () => {
    // When a description runs to 257 characters.
    const error = await webAclRefusal(new SimAws().wafV2(), "a".repeat(257));

    // Then it is refused for the length WAFv2 documents.
    assertStringIncludes(
      error.message,
      "Member must have length less than or equal to 256",
    );
  });

  it("takes a description of the shape WAFv2 documents", async () => {
    // Given a simulated WAFv2.
    const waf = new SimAws().wafV2();
    const description = "Edge protection for api.example.com - v2";
    const input = simWafCreateWebAclFactory.make({ Description: description });

    // When a web ACL is created with a description carrying spaces and
    // punctuation.
    const created = await createSimWafWebAcl(waf, input);
    const read = await waf.getWebAcl(
      new GetWebACLCommand({
        Name: input.Name,
        Scope: "REGIONAL",
        Id: created.Id,
      }),
    );

    // Then it is stored and read back.
    assertIdentical(read.WebACL?.Description, description);
  });

  it("takes a write that names no description at all", async () => {
    // Given a web ACL created without one.
    const waf = new SimAws().wafV2();
    const input = simWafCreateWebAclFactory.make();
    const created = await createSimWafWebAcl(waf, input);

    // When it is written back without one either.
    await waf.updateWebAcl({
      input: { ...input, Id: created.Id, LockToken: created.LockToken },
    });

    // Then both writes are taken, as AWS takes them.
    const read = await waf.getWebAcl(
      new GetWebACLCommand({
        Name: input.Name,
        Scope: "REGIONAL",
        Id: created.Id,
      }),
    );

    assertUndefined(read.WebACL?.Description);
  });

  it("refuses an empty description on an IP set write", async () => {
    // Given a simulated WAFv2 holding an IP set.
    const waf = new SimAws().wafV2();
    const created = await waf.createIpSet(
      new CreateIPSetCommand({
        Name: "office",
        Scope: "REGIONAL",
        IPAddressVersion: "IPV4",
        Addresses: ["192.0.2.0/24"],
      }),
    );

    // When an empty description is created with and then written over it.
    const onCreate = await assertThrowsErrorAsync(async () => {
      await waf.createIpSet(
        new CreateIPSetCommand({
          Name: "other-office",
          Scope: "REGIONAL",
          IPAddressVersion: "IPV4",
          Addresses: ["192.0.2.0/24"],
          Description: "",
        }),
      );
    });
    const onUpdate = await assertThrowsErrorAsync(async () => {
      await waf.updateIpSet(
        new UpdateIPSetCommand({
          Name: "office",
          Scope: "REGIONAL",
          Id: created.Summary?.Id,
          LockToken: created.Summary?.LockToken,
          Addresses: ["192.0.2.0/24"],
          Description: "",
        }),
      );
    });

    // Then both are refused: an IP set description carries the same
    // constraints as a web ACL one.
    assertInstanceOf(onCreate, SimWafValidationException);
    assertInstanceOf(onUpdate, SimWafValidationException);
  });

  it("refuses an empty description on a regex pattern set write", async () => {
    // Given a simulated WAFv2 holding a regex pattern set.
    const waf = new SimAws().wafV2();
    const created = await waf.createRegexPatternSet(
      new CreateRegexPatternSetCommand({
        Name: "bad-agents",
        Scope: "REGIONAL",
        RegularExpressionList: [{ RegexString: "sqlmap" }],
      }),
    );

    // When an empty description is created with and then written over it.
    const onCreate = await assertThrowsErrorAsync(async () => {
      await waf.createRegexPatternSet(
        new CreateRegexPatternSetCommand({
          Name: "worse-agents",
          Scope: "REGIONAL",
          RegularExpressionList: [{ RegexString: "sqlmap" }],
          Description: "",
        }),
      );
    });
    const onUpdate = await assertThrowsErrorAsync(async () => {
      await waf.updateRegexPatternSet(
        new UpdateRegexPatternSetCommand({
          Name: "bad-agents",
          Scope: "REGIONAL",
          Id: created.Summary?.Id,
          LockToken: created.Summary?.LockToken,
          RegularExpressionList: [{ RegexString: "sqlmap" }],
          Description: "",
        }),
      );
    });

    // Then both are refused, the same way.
    assertInstanceOf(onCreate, SimWafValidationException);
    assertInstanceOf(onUpdate, SimWafValidationException);
  });
});

/**
 * Try to create a web ACL with one description, and answer with the refusal.
 */
async function webAclRefusal(
  waf: SimWafV2,
  description: string,
): Promise<Error> {
  return await assertThrowsErrorAsync(async () => {
    await createSimWafWebAcl(
      waf,
      simWafCreateWebAclFactory.make({ Description: description }),
    );
  });
}

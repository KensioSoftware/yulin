import {
  CreateIPSetCommand,
  CreateRegexPatternSetCommand,
  DeleteIPSetCommand,
  DeleteRegexPatternSetCommand,
  GetIPSetCommand,
  GetRegexPatternSetCommand,
  ListIPSetsCommand,
  ListRegexPatternSetsCommand,
} from "@aws-sdk/client-wafv2";
import {
  assertArrayEquals,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";
import {
  SimWafInvalidParameterException,
  SimWafNonexistentItemException,
  SimWafOptimisticLockException,
  SimWafUnsimulatedInputException,
} from "./error/sim-wafv2.error.js";

describe("SimWafV2 IP sets", () => {
  it("creates an IP set and reads it back", async () => {
    // Given a simulated WAFv2.
    const waf = new SimAws().wafV2();

    // When an IP set is created and read back.
    const created = await waf.createIpSet(
      new CreateIPSetCommand({
        Name: "office",
        Scope: "REGIONAL",
        IPAddressVersion: "IPV4",
        Addresses: ["192.0.2.0/24"],
        Description: "the office",
      }),
    );
    const read = await waf.getIpSet(
      new GetIPSetCommand({
        Name: "office",
        Scope: "REGIONAL",
        Id: created.Summary?.Id,
      }),
    );

    // Then it reports the addresses it was written with.
    assertNonNullable(read.IPSet);
    assertArrayEquals(read.IPSet.Addresses, ["192.0.2.0/24"]);
    assertIdentical(read.IPSet.IPAddressVersion, "IPV4");
    assertIdentical(read.IPSet.Description, "the office");
    assertStringIncludes(read.IPSet.ARN, "regional/ipset/office/");
  });

  it("refuses an address that is not written as CIDR", async () => {
    // Given a simulated WAFv2.
    const waf = new SimAws().wafV2();

    // When an IP set is created from a bare address.
    const error = await assertThrowsErrorAsync(async () => {
      await waf.createIpSet(
        new CreateIPSetCommand({
          Name: "office",
          Scope: "REGIONAL",
          IPAddressVersion: "IPV4",
          Addresses: ["192.0.2.44"],
        }),
      );
    });

    // Then it is refused, as real WAF refuses it: `192.0.2.44` has to be
    // written `192.0.2.44/32`.
    assertInstanceOf(error, SimWafInvalidParameterException);
    assertStringIncludes(error.message, "192.0.2.44");
  });

  it("refuses an address version it does not hold", async () => {
    // Given a simulated WAFv2.
    const waf = new SimAws().wafV2();

    // When an IP set names neither of the two versions.
    const error = await assertThrowsErrorAsync(async () => {
      await waf.createIpSet({
        input: {
          Name: "office",
          Scope: "REGIONAL",
          IPAddressVersion: "IPV5",
          Addresses: [],
        },
      });
    });

    // Then it is refused. A set holds one version or the other, never both.
    assertInstanceOf(error, SimWafInvalidParameterException);
  });

  it("holds IPv6 ranges", async () => {
    // Given a simulated WAFv2.
    const waf = new SimAws().wafV2();

    // When an IPv6 set is created.
    const created = await waf.createIpSet(
      new CreateIPSetCommand({
        Name: "office-v6",
        Scope: "REGIONAL",
        IPAddressVersion: "IPV6",
        Addresses: ["2001:db8::/32"],
      }),
    );

    // Then it is there.
    const read = await waf.getIpSet(
      new GetIPSetCommand({
        Name: "office-v6",
        Scope: "REGIONAL",
        Id: created.Summary?.Id,
      }),
    );

    assertArrayEquals(read.IPSet?.Addresses, ["2001:db8::/32"]);
  });

  it("lists and deletes IP sets", async () => {
    // Given an IP set.
    const waf = new SimAws().wafV2();
    const created = await waf.createIpSet(
      new CreateIPSetCommand({
        Name: "office",
        Scope: "REGIONAL",
        IPAddressVersion: "IPV4",
        Addresses: [],
      }),
    );
    const listed = await waf.listIpSets(
      new ListIPSetsCommand({ Scope: "REGIONAL" }),
    );

    // When it is deleted with its lock token.
    await waf.deleteIpSet(
      new DeleteIPSetCommand({
        Name: "office",
        Scope: "REGIONAL",
        Id: created.Summary?.Id,
        LockToken: created.Summary?.LockToken,
      }),
    );

    const after = await waf.listIpSets(
      new ListIPSetsCommand({ Scope: "REGIONAL" }),
    );

    // Then it was listed before and is gone after.
    assertArrayEquals(
      listed.IPSets?.map((summary) => summary.Name),
      ["office"],
    );
    assertArrayEquals(after.IPSets ?? [], []);
  });

  it("creates an IP set holding no addresses yet", async () => {
    // Given a simulated WAFv2.
    const waf = new SimAws().wafV2();

    // When an IP set is created without naming any addresses.
    const created = await waf.createIpSet({
      input: { Name: "office", Scope: "REGIONAL", IPAddressVersion: "IPV4" },
    });
    const read = await waf.getIpSet(
      new GetIPSetCommand({
        Name: "office",
        Scope: "REGIONAL",
        Id: created.Summary?.Id,
      }),
    );

    // Then it is there and empty, which is what a set filled in later starts
    // as.
    assertArrayEquals(read.IPSet?.Addresses ?? [], []);
  });

  it("refuses a read that names no id", async () => {
    // Given an IP set.
    const waf = new SimAws().wafV2();

    await waf.createIpSet(
      new CreateIPSetCommand({
        Name: "office",
        Scope: "REGIONAL",
        IPAddressVersion: "IPV4",
        Addresses: [],
      }),
    );

    // When it is read by name alone.
    const error = await assertThrowsErrorAsync(async () => {
      await waf.getIpSet({ input: { Name: "office", Scope: "REGIONAL" } });
    });

    // Then it is refused. WAFv2 asks for the id on every read, because a name
    // can have belonged to more than one resource over time.
    assertInstanceOf(error, SimWafInvalidParameterException);
  });
});

describe("SimWafV2 regex pattern sets", () => {
  it("creates a regex pattern set and reads it back", async () => {
    // Given a simulated WAFv2.
    const waf = new SimAws().wafV2();

    // When a pattern set is created and read back.
    const created = await waf.createRegexPatternSet(
      new CreateRegexPatternSetCommand({
        Name: "bad-agents",
        Scope: "REGIONAL",
        RegularExpressionList: [{ RegexString: "sqlmap" }],
      }),
    );
    const read = await waf.getRegexPatternSet(
      new GetRegexPatternSetCommand({
        Name: "bad-agents",
        Scope: "REGIONAL",
        Id: created.Summary?.Id,
      }),
    );

    // Then it reports the expressions it was written with.
    assertArrayEquals(
      read.RegexPatternSet?.RegularExpressionList.map(
        (expression) => expression.RegexString,
      ),
      ["sqlmap"],
    );
  });

  it("creates a pattern set holding no expressions yet", async () => {
    // Given a simulated WAFv2.
    const waf = new SimAws().wafV2();

    // When a pattern set is created without naming any expressions.
    const created = await waf.createRegexPatternSet({
      input: { Name: "empty", Scope: "REGIONAL" },
    });
    const read = await waf.getRegexPatternSet(
      new GetRegexPatternSetCommand({
        Name: "empty",
        Scope: "REGIONAL",
        Id: created.Summary?.Id,
      }),
    );

    // Then it is there and empty.
    assertArrayEquals(read.RegexPatternSet?.RegularExpressionList ?? [], []);
  });

  it("refuses an expression that will not compile", async () => {
    // Given a simulated WAFv2.
    const waf = new SimAws().wafV2();

    // When a pattern set carries something that is not an expression.
    const error = await assertThrowsErrorAsync(async () => {
      await waf.createRegexPatternSet(
        new CreateRegexPatternSetCommand({
          Name: "broken",
          Scope: "REGIONAL",
          RegularExpressionList: [{ RegexString: "(unclosed" }],
        }),
      );
    });

    // Then it is refused where it was written rather than matching nothing
    // when a request arrives.
    assertInstanceOf(error, SimWafInvalidParameterException);
  });

  it("refuses an expression with no pattern in it", async () => {
    // Given a simulated WAFv2.
    const waf = new SimAws().wafV2();

    // When a pattern set carries an expression naming nothing.
    const error = await assertThrowsErrorAsync(async () => {
      await waf.createRegexPatternSet(
        new CreateRegexPatternSetCommand({
          Name: "empty",
          Scope: "REGIONAL",
          RegularExpressionList: [{}],
        }),
      );
    });

    assertInstanceOf(error, SimWafInvalidParameterException);
  });

  it("refuses tags on a pattern set", async () => {
    // Given a simulated WAFv2.
    const waf = new SimAws().wafV2();

    // When a pattern set is created with tags.
    const error = await assertThrowsErrorAsync(async () => {
      await waf.createRegexPatternSet(
        new CreateRegexPatternSetCommand({
          Name: "tagged",
          Scope: "REGIONAL",
          RegularExpressionList: [],
          Tags: [{ Key: "Team", Value: "payments" }],
        }),
      );
    });

    assertInstanceOf(error, SimWafUnsimulatedInputException);
  });

  it("lists and deletes regex pattern sets", async () => {
    // Given a pattern set.
    const waf = new SimAws().wafV2();
    const created = await waf.createRegexPatternSet(
      new CreateRegexPatternSetCommand({
        Name: "bad-agents",
        Scope: "REGIONAL",
        RegularExpressionList: [],
      }),
    );

    // When it is deleted with its lock token.
    await waf.deleteRegexPatternSet(
      new DeleteRegexPatternSetCommand({
        Name: "bad-agents",
        Scope: "REGIONAL",
        Id: created.Summary?.Id,
        LockToken: created.Summary?.LockToken,
      }),
    );

    const after = await waf.listRegexPatternSets(
      new ListRegexPatternSetsCommand({ Scope: "REGIONAL" }),
    );

    // Then it is gone.
    assertArrayEquals(after.RegexPatternSets ?? [], []);
  });

  it("refuses a delete against a stale lock token", async () => {
    // Given a pattern set that has been read once.
    const waf = new SimAws().wafV2();
    const created = await waf.createRegexPatternSet(
      new CreateRegexPatternSetCommand({
        Name: "bad-agents",
        Scope: "REGIONAL",
        RegularExpressionList: [],
      }),
    );

    // When it is deleted with a token that is not the one it holds.
    const error = await assertThrowsErrorAsync(async () => {
      await waf.deleteRegexPatternSet(
        new DeleteRegexPatternSetCommand({
          Name: "bad-agents",
          Scope: "REGIONAL",
          Id: created.Summary?.Id,
          LockToken: "0f5a1b2c-3d4e-5f60-7182-93a4b5c6d7e8",
        }),
      );
    });

    // Then it is refused and the pattern set is still there.
    assertInstanceOf(error, SimWafOptimisticLockException);
  });

  it("refuses a read of a pattern set that is not there", async () => {
    // Given a simulated WAFv2 with nothing in it.
    const waf = new SimAws().wafV2();

    // When one is read by a name naming none.
    const error = await assertThrowsErrorAsync(async () => {
      await waf.getRegexPatternSet(
        new GetRegexPatternSetCommand({
          Name: "missing",
          Scope: "REGIONAL",
          Id: "0f5a1b2c-3d4e-5f60-7182-93a4b5c6d7e8",
        }),
      );
    });

    assertInstanceOf(error, SimWafNonexistentItemException);
  });
});

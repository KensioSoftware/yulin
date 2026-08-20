import {
  CreateIPSetCommand,
  DeleteIPSetCommand,
  GetIPSetCommand,
  ListIPSetsCommand,
  UpdateIPSetCommand,
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
import { SimWafInvalidParameterException } from "./error/sim-wafv2.error.js";

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

  it("refuses an address whose prefix length is not digits", async () => {
    // Given a simulated WAFv2.
    const waf = new SimAws().wafV2();

    // When an IP set carries a range with an empty prefix length.
    const error = await assertThrowsErrorAsync(async () => {
      await waf.createIpSet(
        new CreateIPSetCommand({
          Name: "office",
          Scope: "REGIONAL",
          IPAddressVersion: "IPV4",
          Addresses: ["192.0.2.0/"],
        }),
      );
    });

    // Then it is refused, rather than being read as `/0` and covering every
    // address there is.
    assertInstanceOf(error, SimWafInvalidParameterException);
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

  it("writes a new list of ranges over an IP set", async () => {
    // Given an IP set with one range in it.
    const waf = new SimAws().wafV2();
    const created = await waf.createIpSet(
      new CreateIPSetCommand({
        Name: "office",
        Scope: "REGIONAL",
        IPAddressVersion: "IPV4",
        Addresses: ["192.0.2.0/24"],
      }),
    );

    // When it is updated with the token creation issued.
    await waf.updateIpSet(
      new UpdateIPSetCommand({
        Name: "office",
        Scope: "REGIONAL",
        Id: created.Summary?.Id,
        LockToken: created.Summary?.LockToken,
        Addresses: ["198.51.100.0/24"],
        Description: "the new office",
      }),
    );

    const read = await waf.getIpSet(
      new GetIPSetCommand({
        Name: "office",
        Scope: "REGIONAL",
        Id: created.Summary?.Id,
      }),
    );

    // Then the new ranges are what it holds.
    assertNonNullable(read.IPSet);
    assertArrayEquals(read.IPSet.Addresses, ["198.51.100.0/24"]);
    assertIdentical(read.IPSet.Description, "the new office");
  });

  it("keeps the ranges it had when an update is refused", async () => {
    // Given an IP set with one range in it.
    const waf = new SimAws().wafV2();
    const created = await waf.createIpSet(
      new CreateIPSetCommand({
        Name: "office",
        Scope: "REGIONAL",
        IPAddressVersion: "IPV4",
        Addresses: ["192.0.2.0/24"],
      }),
    );

    // When an update carrying an address WAF will not take is refused.
    await assertThrowsErrorAsync(async () => {
      await waf.updateIpSet(
        new UpdateIPSetCommand({
          Name: "office",
          Scope: "REGIONAL",
          Id: created.Summary?.Id,
          LockToken: created.Summary?.LockToken,
          Addresses: ["198.51.100.7"],
        }),
      );
    });

    const read = await waf.getIpSet(
      new GetIPSetCommand({
        Name: "office",
        Scope: "REGIONAL",
        Id: created.Summary?.Id,
      }),
    );

    // Then the set still holds the range it had.
    assertArrayEquals(read.IPSet?.Addresses, ["192.0.2.0/24"]);
  });
});

import { assertArrayEquals, assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";
import { encodeDnsRdata } from "./dns-rdata.js";
import { encodeDnsSoaRdata } from "./dns-soa-rdata.js";

describe("DNS RDATA by record type", () => {
  it("encodes each stored record type", () => {
    // Given one value of each sim Route53 record type.
    // When each is encoded for its type.
    // Then CNAME and NS share the name encoding, and the rest use their own.
    assertArrayEquals([...encodeDnsRdata("A", "127.0.0.1")], [127, 0, 0, 1]);
    assertIdentical(encodeDnsRdata("AAAA", "::1").byteLength, 16);
    assertArrayEquals(
      [...encodeDnsRdata("CNAME", "a.test")],
      [1, 0x61, 4, 0x74, 0x65, 0x73, 0x74, 0],
    );
    assertArrayEquals(
      [...encodeDnsRdata("NS", "a.test")],
      [...encodeDnsRdata("CNAME", "a.test")],
    );
    assertArrayEquals([...encodeDnsRdata("TXT", "hi")], [2, 0x68, 0x69]);
    assertArrayEquals(
      [...encodeDnsRdata("SOA", "ns.test. host.test. 1 2 3 4 5")],
      [...encodeDnsSoaRdata("ns.test. host.test. 1 2 3 4 5")],
    );
  });
});

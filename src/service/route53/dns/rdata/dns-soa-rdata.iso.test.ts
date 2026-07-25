import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { DnsMessageFormatError } from "../error/dns-message.error.js";
import { encodeDnsSoaRdata } from "./dns-soa-rdata.js";

describe("DNS SOA record RDATA", () => {
  const soaValue =
    "ns.example.test. hostmaster.example.test. 1 7200 900 1209600 86400";

  it("encodes the two names followed by five intervals", () => {
    // Given a Route53-style SOA value.
    // When it is encoded.
    const rdata = encodeDnsSoaRdata(soaValue);

    // Then the intervals occupy the last twenty bytes, serial first.
    const view = new DataView(rdata.buffer, rdata.byteOffset, rdata.byteLength);
    const intervalsOffset = rdata.length - 20;
    assertIdentical(view.getUint32(intervalsOffset), 1);
    assertIdentical(view.getUint32(intervalsOffset + 4), 7200);
    assertIdentical(view.getUint32(intervalsOffset + 16), 86_400);
  });

  it("rejects a value without seven fields", () => {
    const error = assertThrowsError(() => encodeDnsSoaRdata("ns.test. 1 2"));

    assertInstanceOf(error, DnsMessageFormatError);
    assertStringIncludes(error.message, "expected 7 fields, found 3");
  });

  it("rejects an interval that is not a 32-bit number", () => {
    const error = assertThrowsError(() =>
      encodeDnsSoaRdata("ns.test. host.test. 1 7200 900 1209600 nope"),
    );

    assertInstanceOf(error, DnsMessageFormatError);
    assertStringIncludes(error.message, "is not a 32-bit interval");
  });

  it("rejects an interval over the 32-bit range", () => {
    const error = assertThrowsError(() =>
      encodeDnsSoaRdata("ns.test. host.test. 1 7200 900 1209600 4294967296"),
    );

    assertInstanceOf(error, DnsMessageFormatError);
    assertStringIncludes(error.message, "is not a 32-bit interval");
  });

  it("rejects intervals JavaScript number coercion would otherwise accept", () => {
    // Given SOA intervals written as hexadecimal and exponent forms.
    // When each is encoded.
    // Then neither is silently converted to some other interval.
    for (const serial of ["0x10", "1e2"]) {
      const error = assertThrowsError(() =>
        encodeDnsSoaRdata(
          `ns.test. host.test. ${serial} 7200 900 1209600 86400`,
        ),
      );

      assertInstanceOf(error, DnsMessageFormatError);
      assertStringIncludes(error.message, "is not a 32-bit interval");
    }
  });
});

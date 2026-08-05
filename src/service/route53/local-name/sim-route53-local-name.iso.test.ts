import { describe, it } from "vitest";
import { assertIdentical, assertUndefined } from "@kensio/smartass";
import {
  simRoute53LocalName,
  simRoute53LogicalHostname,
  simRoute53LogicalName,
} from "./sim-route53-local-name.js";

describe("sim Route53 local name utils", () => {
  describe("simRoute53LogicalName", () => {
    it("returns undefined for empty logical names", () => {
      // Given a local Route53 name with no logical name before the suffix.
      const localName = "sim-aws.localhost";

      // When converting the local name to a logical DNS name.
      const logicalName = simRoute53LogicalName(localName);

      // Then no logical DNS name is returned.
      assertUndefined(logicalName);
    });

    it("returns undefined for logical names containing empty labels", () => {
      // Given a local Route53 name whose logical name contains an empty label.
      const localName = "www..foo.com.sim-aws.localhost";

      // When converting the local name to a logical DNS name.
      const logicalName = simRoute53LogicalName(localName);

      // Then no logical DNS name is returned.
      assertUndefined(logicalName);
    });

    it("returns undefined for logical names with leading empty labels", () => {
      // Given a local Route53 name whose logical name starts with an empty label.
      const localName = ".www.foo.com.sim-aws.localhost";

      // When converting the local name to a logical DNS name.
      const logicalName = simRoute53LogicalName(localName);

      // Then no logical DNS name is returned.
      assertUndefined(logicalName);
    });

    it("returns undefined for logical names with trailing empty labels", () => {
      // Given a local Route53 name whose logical name ends with an empty label.
      const localName = "www.foo.com..sim-aws.localhost";

      // When converting the local name to a logical DNS name.
      const logicalName = simRoute53LogicalName(localName);

      // Then no logical DNS name is returned.
      assertUndefined(logicalName);
    });
  });

  describe("simRoute53LogicalHostname", () => {
    it("strips the local suffix when a hostname carries one", () => {
      // Given a requested hostname carrying the simulated local suffix.
      const hostname = "WWW.FOO.COM.sim-aws.localhost.";

      // When converting it to a logical DNS name.
      const logicalName = simRoute53LogicalHostname(hostname);

      // Then the logical name is returned in normalised form.
      assertIdentical(logicalName, "www.foo.com");
    });

    it("returns a hostname with no local suffix as the logical name", () => {
      // Given a requested hostname with no simulated local suffix, as a browser
      // sends after the simulated DNS server has answered for the name.
      const hostname = "WWW.FOO.COM.";

      // When converting it to a logical DNS name.
      const logicalName = simRoute53LogicalHostname(hostname);

      // Then it is already the logical name, in normalised form.
      assertIdentical(logicalName, "www.foo.com");
    });

    it("returns undefined for hostnames containing empty labels", () => {
      // Given a malformed hostname with an empty label and no local suffix.
      const hostname = "www..foo.com";

      // When converting it to a logical DNS name.
      const logicalName = simRoute53LogicalHostname(hostname);

      // Then no logical DNS name is returned.
      assertUndefined(logicalName);
    });

    it("returns undefined for a bare local suffix", () => {
      // Given a hostname that is the local suffix with nothing before it.
      const hostname = ".sim-aws.localhost";

      // When converting it to a logical DNS name.
      const logicalName = simRoute53LogicalHostname(hostname);

      // Then no logical DNS name is returned.
      assertUndefined(logicalName);
    });
  });

  describe("simRoute53LocalName", () => {
    it("returns already-local Route53 names unchanged after normalisation", () => {
      // Given a Route53 name that already ends with the simulated local suffix.
      const logicalName = "WWW.FOO.COM.SIM-AWS.LOCALHOST.";

      // When converting it to a local Route53 name.
      const localName = simRoute53LocalName(logicalName);

      // Then the existing local name is returned in normalised form.
      assertIdentical(localName, "www.foo.com.sim-aws.localhost");
    });
  });
});

import { describe, it } from "vitest";
import { assertIdentical, assertUndefined } from "@kensio/smartass";
import {
  simRoute53LocalName,
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

import { describe, it } from "vitest";
import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { SimRoute53InvalidInput } from "../../error/sim-route53.error.js";
import {
  assertIsSimRoute53HostedZoneId,
  makeSimRoute53HostedZoneId,
  normalizeSimRoute53HostedZoneId,
} from "./sim-route53-zone-id.js";

describe("sim Route53 Hosted Zone ID", () => {
  describe("normalizeSimRoute53HostedZoneId", () => {
    it("accepts a real 14 character Hosted Zone ID", () => {
      // Given a real Route53 Hosted Zone ID copied from AWS.
      const value = "Z2FDTNDATAQYW2";

      // When the Hosted Zone ID is normalized.
      const hostedZoneId = normalizeSimRoute53HostedZoneId(value);

      // Then the Hosted Zone ID is accepted unchanged.
      assertIdentical(hostedZoneId, value);
    });

    it("accepts a real 20 character Hosted Zone ID", () => {
      // Given a real Route53 Hosted Zone ID copied from AWS.
      const value = "Z04589353OZQGDQ0X1RG";

      // When the Hosted Zone ID is normalized.
      const hostedZoneId = normalizeSimRoute53HostedZoneId(value);

      // Then the Hosted Zone ID is accepted unchanged.
      assertIdentical(hostedZoneId, value);
    });

    it("accepts an allocated simulated Hosted Zone ID", () => {
      // Given a Hosted Zone ID allocated by the simulator.
      const value = makeSimRoute53HostedZoneId();

      // When the Hosted Zone ID is normalized.
      const hostedZoneId = normalizeSimRoute53HostedZoneId(value);

      // Then the Hosted Zone ID is accepted unchanged.
      assertIdentical(hostedZoneId, value);
    });

    it("strips a leading /hostedzone/ prefix", () => {
      // Given a Hosted Zone ID in its resource path form.
      const value = "/hostedzone/Z2FDTNDATAQYW2";

      // When the Hosted Zone ID is normalized.
      const hostedZoneId = normalizeSimRoute53HostedZoneId(value);

      // Then the bare Hosted Zone ID is returned.
      assertIdentical(hostedZoneId, "Z2FDTNDATAQYW2");
    });

    it("rejects a Hosted Zone ID longer than 32 characters", () => {
      // Given a Hosted Zone ID over the documented maximum length.
      const value = `Z${"A".repeat(32)}`;

      // When the Hosted Zone ID is normalized.
      const error = assertThrowsError(() =>
        normalizeSimRoute53HostedZoneId(value),
      );

      // Then InvalidInput is reported.
      assertInstanceOf(error, SimRoute53InvalidInput);
      assertIdentical(
        error.message,
        `Invalid Route53 Hosted Zone ID: ${value}`,
      );
    });

    it("rejects a Hosted Zone ID without the Z prefix", () => {
      // Given a Hosted Zone ID that does not start with Z.
      const value = "A2FDTNDATAQYW2";

      // When the Hosted Zone ID is normalized.
      const error = assertThrowsError(() =>
        normalizeSimRoute53HostedZoneId(value),
      );

      // Then InvalidInput is reported.
      assertInstanceOf(error, SimRoute53InvalidInput);
    });

    it("rejects a lowercase Hosted Zone ID", () => {
      // Given a Hosted Zone ID in lowercase.
      const value = "z2fdtndataqyw2";

      // When the Hosted Zone ID is normalized.
      const error = assertThrowsError(() =>
        normalizeSimRoute53HostedZoneId(value),
      );

      // Then InvalidInput is reported.
      assertInstanceOf(error, SimRoute53InvalidInput);
    });

    it("names CDK's unresolved lookup stand-in", () => {
      // Given the Hosted Zone ID CDK synthesizes for an unresolved
      // HostedZone.fromLookup.
      const value = "DUMMY";

      // When the Hosted Zone ID is normalized.
      const error = assertThrowsError(() =>
        normalizeSimRoute53HostedZoneId(value),
      );

      // Then InvalidInput names the stand-in and how to resolve the lookup.
      assertInstanceOf(error, SimRoute53InvalidInput);
      assertIdentical(
        error.message,
        "Invalid Route53 Hosted Zone ID: DUMMY. CDK fills an unresolved " +
          "`HostedZone.fromLookup` with this stand-in. Run `cdk synth` with " +
          "credentials for the account holding the zone, or commit the " +
          "`cdk.context.json` a resolved lookup writes.",
      );
    });

    it("names the stand-in behind a /hostedzone/ prefix", () => {
      // Given the stand-in in its resource path form.
      const value = "/hostedzone/DUMMY";

      // When the Hosted Zone ID is normalized.
      const error = assertThrowsError(() =>
        normalizeSimRoute53HostedZoneId(value),
      );

      // Then InvalidInput still points at the unresolved lookup.
      assertInstanceOf(error, SimRoute53InvalidInput);
      assertStringIncludes(
        error.message,
        "CDK fills an unresolved `HostedZone.fromLookup` with this stand-in.",
      );
    });

    it("rejects an ID merely containing DUMMY with the plain message", () => {
      // Given a malformed ID that holds the stand-in as a substring.
      const value = "DUMMYZONE!";

      // When the Hosted Zone ID is normalized.
      const error = assertThrowsError(() =>
        normalizeSimRoute53HostedZoneId(value),
      );

      // Then InvalidInput reports the value and nothing about CDK.
      assertInstanceOf(error, SimRoute53InvalidInput);
      assertIdentical(
        error.message,
        "Invalid Route53 Hosted Zone ID: DUMMYZONE!",
      );
    });

    it("rejects a missing Hosted Zone ID", () => {
      // Given no Hosted Zone ID at all.
      const value = undefined;

      // When the Hosted Zone ID is normalized.
      const error = assertThrowsError(() =>
        normalizeSimRoute53HostedZoneId(value),
      );

      // Then InvalidInput reports the missing ID.
      assertInstanceOf(error, SimRoute53InvalidInput);
      assertIdentical(
        error.message,
        "Invalid Route53 Hosted Zone ID: (missing)",
      );
    });
  });

  describe("assertIsSimRoute53HostedZoneId", () => {
    it("throws for a value that is not a Hosted Zone ID", () => {
      // Given a value that is not a Hosted Zone ID.
      const value = 123;

      // When the value is asserted to be a Hosted Zone ID.
      const error = assertThrowsError(() => {
        assertIsSimRoute53HostedZoneId(value);
      });

      // Then the invariant failure is reported.
      assertIdentical(error.message, "Not a SimRoute53HostedZoneId");
    });
  });
});

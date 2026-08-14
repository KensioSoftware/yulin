import { GetDNSSECCommand } from "@aws-sdk/client-route-53";
import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simRoute53DnssecFixture } from "../../../../../test/route53/dnssec-fixture.js";

describe("Route53 DNSSEC IAM authorization", () => {
  it("denies an anonymous caller", async () => {
    // Given a hosted zone in a simulated Account.
    const fixture = await simRoute53DnssecFixture();

    // When an explicitly anonymous caller reads its DNSSEC.
    const error = await assertThrowsErrorAsync(async () =>
      fixture.simAws
        .route53()
        .getDnssec(
          new GetDNSSECCommand({ HostedZoneId: fixture.hostedZoneId }),
          { caller: { kind: "anonymous" } },
        ),
    );

    // Then it is denied, against the hosted zone's own ARN rather than a
    // wildcard, so a policy can grant DNSSEC on one zone alone.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "route53:GetDNSSEC");
    assertIdentical(
      error.resource,
      `arn:aws:route53:::hostedzone/${fixture.hostedZoneId}`,
    );
  });

  it("allows the default Account root caller", async () => {
    // Given the same hosted zone.
    const fixture = await simRoute53DnssecFixture();

    // When DNSSEC is read with no caller named, then IAM defaults to Account
    // root and the read is allowed.
    const dnssec = await fixture.simAws
      .route53()
      .getDnssec(new GetDNSSECCommand({ HostedZoneId: fixture.hostedZoneId }));

    assertIdentical(dnssec.Status?.ServeSignature, "NOT_SIGNING");
  });
});

/**
 * The arrangement the Route53 DNSSEC test files share: a hosted zone, and an
 * ECC_NIST_P256 signing key in KMS for a key-signing key to be built on.
 *
 * It lives under `test/` for the same reasons as `test/kms/`: eslint rejects a
 * test file that exports helpers alongside its own `describe` calls, and
 * `test/**` is type-checked with everything else, excluded from the published
 * build, not collected as a suite, and not counted in coverage.
 */

import { CreateKeyCommand } from "@aws-sdk/client-kms";
import { CreateHostedZoneCommand } from "@aws-sdk/client-route-53";
import { assertNonNullable } from "@kensio/smartass";

import { SimAws } from "../../src/service/aws/sim-aws.js";

/**
 * The zone name the DNSSEC tests sign.
 */
export const simRoute53DnssecZoneName = "example.test";

export interface SimRoute53DnssecFixture {
  readonly simAws: SimAws;
  readonly hostedZoneId: string;
  readonly kmsKeyArn: string;
}

/**
 * A hosted zone and a KMS signing key, ready for a key-signing key.
 */
export async function simRoute53DnssecFixture(): Promise<SimRoute53DnssecFixture> {
  const simAws = new SimAws();

  const zone = await simAws.route53().createHostedZone(
    new CreateHostedZoneCommand({
      Name: simRoute53DnssecZoneName,
      CallerReference: "dnssec-zone",
    }),
  );
  assertNonNullable(zone.HostedZone?.Id);

  return {
    simAws,
    hostedZoneId: zone.HostedZone.Id,
    kmsKeyArn: await simKmsSigningKeyArn(simAws),
  };
}

/**
 * An ECC_NIST_P256 signing key, which is the only kind Route53 will build a
 * key-signing key on.
 */
export async function simKmsSigningKeyArn(simAws: SimAws): Promise<string> {
  const key = await simAws.kms().createKey(
    new CreateKeyCommand({
      KeySpec: "ECC_NIST_P256",
      KeyUsage: "SIGN_VERIFY",
    }),
  );
  assertNonNullable(key.KeyMetadata);

  return key.KeyMetadata.Arn;
}

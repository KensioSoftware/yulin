/**
 * Signing a simulated Route53 Hosted Zone with DNSSEC.
 */

import { CreateKeyCommand } from "@aws-sdk/client-kms";
import {
  CreateHostedZoneCommand,
  CreateKeySigningKeyCommand,
  EnableHostedZoneDNSSECCommand,
  GetDNSSECCommand,
} from "@aws-sdk/client-route-53";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const zone = await simAws.route53().createHostedZone(
  new CreateHostedZoneCommand({
    Name: "example.test",
    CallerReference: "dnssec-zone",
  }),
);
const HostedZoneId = zone.HostedZone?.Id;

const key = await simAws.kms().createKey(
  new CreateKeyCommand({
    KeySpec: "ECC_NIST_P256",
    KeyUsage: "SIGN_VERIFY",
  }),
);

await simAws.route53().createKeySigningKey(
  new CreateKeySigningKeyCommand({
    CallerReference: "ksk",
    HostedZoneId,
    KeyManagementServiceArn: key.KeyMetadata?.Arn,
    Name: "zone_signing_key",
    Status: "ACTIVE",
  }),
);

await simAws
  .route53()
  .enableHostedZoneDnssec(new EnableHostedZoneDNSSECCommand({ HostedZoneId }));

const dnssec = await simAws
  .route53()
  .getDnssec(new GetDNSSECCommand({ HostedZoneId }));

console.log(dnssec.Status?.ServeSignature); // "SIGNING"

// The DS record the zone's registrar would be given, computed from the KMS
// key's own public key: "<KeyTag> 13 2 <DigestValue>".
console.log(dnssec.KeySigningKeys?.[0]?.DSRecord);

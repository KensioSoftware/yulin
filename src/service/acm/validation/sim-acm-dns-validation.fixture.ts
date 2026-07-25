import { assertNonNullable } from "@kensio/smartass";

import type { SimAws } from "../../aws/sim-aws.js";

interface ValidationRecord {
  readonly name: string;
  readonly value: string;
}

/**
 * Test support for the sim ACM DNS validation flow.
 *
 * These helpers drive the simulator through structural command shapes rather
 * than real SDK command objects, because this is source rather than a test
 * file. The colocated tests cover SDK-shaped input.
 */

/**
 * Create a Hosted Zone, optionally owned by another simulated Account.
 */
export async function createHostedZone(
  simAws: SimAws,
  name: string,
  accountId?: string,
): Promise<string> {
  const output = await simAws
    .account(accountId)
    .route53()
    .createHostedZone({ input: { Name: name, CallerReference: name } });

  assertNonNullable(output.HostedZone?.Id);

  return output.HostedZone.Id;
}

/**
 * Read the current status of a Certificate.
 */
export async function certificateStatus(
  simAws: SimAws,
  certificateArn: string | undefined,
): Promise<string | undefined> {
  const output = await simAws
    .acm()
    .describeCertificate({ input: { CertificateArn: certificateArn } });

  return output.Certificate?.Status;
}

/**
 * Read the per-domain validation statuses of a Certificate, in order.
 */
export async function domainValidationStatuses(
  simAws: SimAws,
  certificateArn: string | undefined,
): Promise<readonly (string | undefined)[]> {
  const output = await simAws
    .acm()
    .describeCertificate({ input: { CertificateArn: certificateArn } });
  const validations = output.Certificate?.DomainValidationOptions;

  assertNonNullable(validations);

  return validations.map((validation) => validation.ValidationStatus);
}

/**
 * Read the DNS validation records ACM is waiting for, in domain order.
 */
export async function validationRecords(
  simAws: SimAws,
  certificateArn: string | undefined,
): Promise<readonly ValidationRecord[]> {
  const output = await simAws
    .acm()
    .describeCertificate({ input: { CertificateArn: certificateArn } });
  const validations = output.Certificate?.DomainValidationOptions;

  assertNonNullable(validations);

  return validations.map((validation) => {
    const resourceRecord = validation.ResourceRecord;
    assertNonNullable(resourceRecord?.Name);
    assertNonNullable(resourceRecord.Value);

    return { name: resourceRecord.Name, value: resourceRecord.Value };
  });
}

/**
 * Publish one CNAME into a Hosted Zone through the Route53 command path.
 */
export async function publishCname(
  simAws: SimAws,
  hostedZoneId: string,
  record: ValidationRecord,
  value = record.value,
): Promise<void> {
  await simAws.route53().changeResourceRecordSets({
    input: {
      HostedZoneId: hostedZoneId,
      ChangeBatch: {
        Changes: [
          {
            Action: "CREATE",
            ResourceRecordSet: {
              Name: record.name,
              Type: "CNAME",
              TTL: 300,
              ResourceRecords: [{ Value: value }],
            },
          },
        ],
      },
    },
  });

  await simAws.backgroundTasksComplete();
}

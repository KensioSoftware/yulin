/**
 * Validating a simulated ACM certificate against a simulated Route53 record.
 */

import {
  DescribeCertificateCommand,
  RequestCertificateCommand,
} from "@aws-sdk/client-acm";
import {
  ChangeResourceRecordSetsCommand,
  CreateHostedZoneCommand,
} from "@aws-sdk/client-route-53";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const zoneOutput = await simAws.route53().createHostedZone(
  new CreateHostedZoneCommand({
    Name: "example.test",
    CallerReference: "acm-dns-validation",
  }),
);

const requestOutput = await simAws.acm().requestCertificate(
  new RequestCertificateCommand({
    DomainName: "api.example.test",
  }),
);

await simAws.backgroundTasksComplete();

// A hosted zone covers the domain, so the certificate waits for its record.
const pendingOutput = await simAws.acm().describeCertificate(
  new DescribeCertificateCommand({
    CertificateArn: requestOutput.CertificateArn,
  }),
);

console.log(pendingOutput.Certificate?.Status); // PENDING_VALIDATION

const validationRecord =
  pendingOutput.Certificate?.DomainValidationOptions?.[0]?.ResourceRecord;

await simAws.route53().changeResourceRecordSets(
  new ChangeResourceRecordSetsCommand({
    HostedZoneId: zoneOutput.HostedZone?.Id,
    ChangeBatch: {
      Changes: [
        {
          Action: "CREATE",
          ResourceRecordSet: {
            Name: validationRecord?.Name,
            Type: "CNAME",
            TTL: 300,
            ResourceRecords: [{ Value: validationRecord?.Value ?? "" }],
          },
        },
      ],
    },
  }),
);

await simAws.backgroundTasksComplete();

const issuedOutput = await simAws.acm().describeCertificate(
  new DescribeCertificateCommand({
    CertificateArn: requestOutput.CertificateArn,
  }),
);

console.log(issuedOutput.Certificate?.Status); // ISSUED

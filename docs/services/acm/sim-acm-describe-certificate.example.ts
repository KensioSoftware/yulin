/**
 * Describing a simulated ACM certificate and its DNS validation records.
 */

import {
  DescribeCertificateCommand,
  RequestCertificateCommand,
} from "@aws-sdk/client-acm";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const acm = simAws.acm();

const requestOutput = await acm.requestCertificate(
  new RequestCertificateCommand({
    DomainName: "example.test",
    SubjectAlternativeNames: ["www.example.test"],
    ValidationMethod: "DNS",
  }),
);

const describeOutput = await acm.describeCertificate(
  new DescribeCertificateCommand({
    CertificateArn: requestOutput.CertificateArn,
  }),
);

const certificate = describeOutput.Certificate;

console.log(certificate?.DomainName);
console.log(certificate?.Status);

for (const validation of certificate?.DomainValidationOptions ?? []) {
  console.log(validation.DomainName);
  console.log(validation.ValidationMethod);
  console.log(validation.ResourceRecord?.Name);
  console.log(validation.ResourceRecord?.Type);
  console.log(validation.ResourceRecord?.Value);
}

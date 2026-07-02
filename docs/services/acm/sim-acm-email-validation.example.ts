/**
 * Requesting a simulated ACM certificate with EMAIL validation.
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
    DomainName: "mail.example.test",
    ValidationMethod: "EMAIL",
  }),
);

const describeOutput = await acm.describeCertificate(
  new DescribeCertificateCommand({
    CertificateArn: requestOutput.CertificateArn,
  }),
);

const validation = describeOutput.Certificate?.DomainValidationOptions?.[0];

console.log(validation?.ValidationMethod);
console.log(validation?.ResourceRecord);

/**
 * Waiting for a simulated ACM certificate to be issued.
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
    DomainName: "issued.example.test",
  }),
);

await simAws.backgroundTasksComplete();

const describeOutput = await acm.describeCertificate(
  new DescribeCertificateCommand({
    CertificateArn: requestOutput.CertificateArn,
  }),
);

console.log(describeOutput.Certificate?.Status);
console.log(describeOutput.Certificate?.IssuedAt);

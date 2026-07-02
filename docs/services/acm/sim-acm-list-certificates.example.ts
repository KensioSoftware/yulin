/**
 * Listing simulated ACM certificates.
 */

import {
  ListCertificatesCommand,
  RequestCertificateCommand,
} from "@aws-sdk/client-acm";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const acm = simAws.acm();

await acm.requestCertificate(
  new RequestCertificateCommand({
    DomainName: "one.example.test",
  }),
);

await acm.requestCertificate(
  new RequestCertificateCommand({
    DomainName: "two.example.test",
  }),
);

const listOutput = await acm.listCertificates(
  new ListCertificatesCommand({
    MaxItems: 10,
  }),
);

for (const summary of listOutput.CertificateSummaryList ?? []) {
  console.log(summary.CertificateArn);
  console.log(summary.DomainName);
  console.log(summary.Status);
}

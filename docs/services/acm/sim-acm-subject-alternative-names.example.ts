/**
 * Requesting a simulated ACM certificate with subject alternative names.
 */

import {
  ListCertificatesCommand,
  RequestCertificateCommand,
} from "@aws-sdk/client-acm";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const acm = simAws.acm();

const requestOutput = await acm.requestCertificate(
  new RequestCertificateCommand({
    DomainName: "example.test",
    SubjectAlternativeNames: ["www.example.test", "api.example.test"],
  }),
);

const listOutput = await acm.listCertificates(new ListCertificatesCommand());

console.log(requestOutput.CertificateArn);
console.log(
  listOutput.CertificateSummaryList?.[0]?.SubjectAlternativeNameSummaries,
);

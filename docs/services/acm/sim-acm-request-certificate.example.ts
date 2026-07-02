/**
 * Requesting a simulated ACM certificate.
 */

import {
  ListCertificatesCommand,
  RequestCertificateCommand,
} from "@aws-sdk/client-acm";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const acm = simAws.account("555555555555").region("eu-west-1").acm();

const requestOutput = await acm.requestCertificate(
  new RequestCertificateCommand({
    DomainName: "example.test",
  }),
);

console.log(requestOutput.CertificateArn);

const listOutput = await acm.listCertificates(new ListCertificatesCommand());

console.log(listOutput.CertificateSummaryList?.[0]?.DomainName);
console.log(listOutput.CertificateSummaryList?.[0]?.Status);

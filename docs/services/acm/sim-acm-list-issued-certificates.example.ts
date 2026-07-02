/**
 * Filtering simulated ACM certificates by status.
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
    DomainName: "issued.example.test",
  }),
);

await simAws.backgroundTasksComplete();

const listOutput = await acm.listCertificates(
  new ListCertificatesCommand({
    CertificateStatuses: ["ISSUED"],
  }),
);

console.log(listOutput.CertificateSummaryList?.map((cert) => cert.DomainName));

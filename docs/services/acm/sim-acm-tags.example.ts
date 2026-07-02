/**
 * Requesting a simulated ACM certificate with tags.
 */

import { RequestCertificateCommand } from "@aws-sdk/client-acm";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const acm = simAws.acm();

await acm.requestCertificate(
  new RequestCertificateCommand({
    DomainName: "tagged.example.test",
    Tags: [
      {
        Key: "Purpose",
        Value: "local-test",
      },
      {
        Key: "Owner",
        Value: "docs",
      },
    ],
  }),
);

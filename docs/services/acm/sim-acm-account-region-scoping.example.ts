/**
 * Simulated ACM account and region scoping.
 */

import { RequestCertificateCommand } from "@aws-sdk/client-acm";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const defaultAcm = simAws.acm();
const euWest2Acm = simAws.region("eu-west-2").acm();
const accountAcm = simAws.account("111111111111").acm();
const scopedAcm = simAws.account("222222222222").region("ap-east-1").acm();

await defaultAcm.requestCertificate(
  new RequestCertificateCommand({
    DomainName: "default.example.test",
  }),
);

await euWest2Acm.requestCertificate(
  new RequestCertificateCommand({
    DomainName: "eu-west-2.example.test",
  }),
);

await accountAcm.requestCertificate(
  new RequestCertificateCommand({
    DomainName: "account.example.test",
  }),
);

await scopedAcm.requestCertificate(
  new RequestCertificateCommand({
    DomainName: "scoped.example.test",
  }),
);

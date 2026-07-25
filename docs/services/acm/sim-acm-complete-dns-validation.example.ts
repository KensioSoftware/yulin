/**
 * Completing simulated ACM DNS validation in one call.
 */

import {
  DescribeCertificateCommand,
  RequestCertificateCommand,
} from "@aws-sdk/client-acm";
import { CreateHostedZoneCommand } from "@aws-sdk/client-route-53";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws.route53().createHostedZone(
  new CreateHostedZoneCommand({
    Name: "example.test",
    CallerReference: "acm-shortcut",
  }),
);

const requestOutput = await simAws.acm().requestCertificate(
  new RequestCertificateCommand({
    DomainName: "api.example.test",
  }),
);

await simAws.acm().completeDnsValidation(requestOutput.CertificateArn);

const describeOutput = await simAws.acm().describeCertificate(
  new DescribeCertificateCommand({
    CertificateArn: requestOutput.CertificateArn,
  }),
);

console.log(describeOutput.Certificate?.Status); // ISSUED

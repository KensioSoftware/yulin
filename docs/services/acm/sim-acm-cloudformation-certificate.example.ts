/**
 * Creating an ACM certificate through simulated CloudFormation.
 */

import {
  DescribeCertificateCommand,
  ListCertificatesCommand,
} from "@aws-sdk/client-acm";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "acm-certificate-stack",
  template: {
    Resources: {
      SiteCertificate: {
        Type: "AWS::CertificateManager::Certificate",
        Properties: {
          DomainName: "example.test",
          SubjectAlternativeNames: ["www.example.test"],
          ValidationMethod: "DNS",
          DomainValidationOptions: [
            {
              DomainName: "example.test",
              ValidationDomain: "example.test",
            },
          ],
          Tags: [
            {
              Key: "Purpose",
              Value: "local-test",
            },
          ],
        },
      },
    },
    Outputs: {
      CertificateArn: {
        Value: {
          Ref: "SiteCertificate",
        },
      },
      CertificateStatus: {
        Value: {
          "Fn::GetAtt": ["SiteCertificate", "CertificateStatus"],
        },
      },
    },
  },
});

const certificateArn = stack.outputs.get("CertificateArn")?.value;
if (typeof certificateArn !== "string")
  throw new Error("No CertificateArn Output");

const listOutput = await simAws
  .acm()
  .listCertificates(new ListCertificatesCommand());

const describeOutput = await simAws.acm().describeCertificate(
  new DescribeCertificateCommand({
    CertificateArn: certificateArn,
  }),
);

console.log(stack.outputs.get("CertificateStatus")?.value);
console.log(listOutput.CertificateSummaryList?.[0]?.DomainName);
console.log(describeOutput.Certificate?.Status);

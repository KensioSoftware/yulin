/**
 * Validating an ACM certificate from a simulated CloudFormation template.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "acm-dns-validation-stack",
  template: {
    Resources: {
      Zone: {
        Type: "AWS::Route53::HostedZone",
        Properties: {
          Name: "example.test",
        },
      },
      SiteCertificate: {
        Type: "AWS::CertificateManager::Certificate",
        Properties: {
          DomainName: "api.example.test",
          ValidationMethod: "DNS",
          DomainValidationOptions: [
            {
              DomainName: "api.example.test",
              HostedZoneId: { Ref: "Zone" },
            },
          ],
        },
      },
    },
    Outputs: {
      CertificateStatus: {
        Value: {
          "Fn::GetAtt": ["SiteCertificate", "CertificateStatus"],
        },
      },
    },
  },
});

await stack.waitForDeployComplete();

// The hosted zone, the validation record and the issued certificate, from one
// template deploy.
console.log(stack.outputs.get("CertificateStatus")?.value); // ISSUED

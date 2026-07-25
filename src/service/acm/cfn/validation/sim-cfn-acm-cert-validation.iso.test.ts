import { describe, it } from "vitest";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { DescribeCertificateCommand } from "@aws-sdk/client-acm";
import { ListResourceRecordSetsCommand } from "@aws-sdk/client-route-53";

import { SimAws } from "../../../aws/sim-aws.js";
import type { CfnTemplateBodyRecord } from "../../../cloudformation/template/sim-cfn-template.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";

function certificateTemplate(
  hostedZoneId: SimCfnTemplateValueRecord | string,
): CfnTemplateBodyRecord {
  return {
    Resources: {
      Zone: {
        Type: "AWS::Route53::HostedZone",
        Properties: { Name: "example.test" },
      },
      SiteCertificate: {
        Type: "AWS::CertificateManager::Certificate",
        Properties: {
          DomainName: "api.example.test",
          ValidationMethod: "DNS",
          DomainValidationOptions: [
            {
              DomainName: "api.example.test",
              HostedZoneId: hostedZoneId,
            },
          ],
        },
      },
    },
    Outputs: {
      CertificateStatus: {
        Value: { "Fn::GetAtt": ["SiteCertificate", "CertificateStatus"] },
      },
    },
  };
}

describe("Sim CloudFormation ACM certificate DNS validation", () => {
  it("issues a certificate validated through a Ref hosted zone", async () => {
    // Given a template with a hosted zone and a certificate referencing it.
    const simAws = new SimAws();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "acm-dns-validation-stack",
      template: certificateTemplate({ Ref: "Zone" }),
    });
    await stack.waitForDeployComplete();

    // Then the certificate is issued by the time deployment completes.
    assertIdentical(stack.outputs.get("CertificateStatus")?.value, "ISSUED");
  });

  it("publishes the validation record into the hosted zone", async () => {
    // Given a deployed certificate validated through its hosted zone.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "acm-validation-record-stack",
      template: certificateTemplate({ Ref: "Zone" }),
    });
    await stack.waitForDeployComplete();

    const hostedZone = simAws.route53().hostedZones.values().next().value;
    assertNonNullable(hostedZone);

    // When the hosted zone's records are listed.
    const listOutput = await simAws
      .route53()
      .listResourceRecordSets(
        new ListResourceRecordSetsCommand({ HostedZoneId: hostedZone.id }),
      );

    // Then the validation CNAME is an ordinary record in the zone.
    assertNonNullable(listOutput.ResourceRecordSets);
    assertArrayLength(listOutput.ResourceRecordSets, 1);
    const [recordSet] = listOutput.ResourceRecordSets;
    assertIdentical(recordSet.Type, "CNAME");
    assertStringIncludes(String(recordSet.Name), "_yulin-acm-");
  });

  it("issues a certificate naming a hosted zone outside the simulator", async () => {
    // Given a template naming a hosted zone this simulator does not hold,
    // as when Route53 is managed by another team or another tool.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "acm-external-zone-stack",
      template: {
        Resources: {
          SiteCertificate: {
            Type: "AWS::CertificateManager::Certificate",
            Properties: {
              DomainName: "api.external.test",
              ValidationMethod: "DNS",
              DomainValidationOptions: [
                {
                  DomainName: "api.external.test",
                  HostedZoneId: "Z0000000000000000000A",
                },
              ],
            },
          },
        },
        Outputs: {
          CertificateStatus: {
            Value: { "Fn::GetAtt": ["SiteCertificate", "CertificateStatus"] },
          },
        },
      },
    });

    // When the deployment completes.
    await stack.waitForDeployComplete();

    // Then the certificate is issued rather than blocking the stack.
    assertIdentical(stack.outputs.get("CertificateStatus")?.value, "ISSUED");
  });

  it("validates every domain of a multi-domain certificate", async () => {
    // Given a certificate with a subject alternative name, each domain
    // naming the hosted zone it validates through.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "acm-multi-domain-stack",
      template: {
        Resources: {
          Zone: {
            Type: "AWS::Route53::HostedZone",
            Properties: { Name: "example.test" },
          },
          SiteCertificate: {
            Type: "AWS::CertificateManager::Certificate",
            Properties: {
              DomainName: "api.example.test",
              SubjectAlternativeNames: ["www.example.test"],
              ValidationMethod: "DNS",
              DomainValidationOptions: [
                {
                  DomainName: "api.example.test",
                  HostedZoneId: { Ref: "Zone" },
                },
                {
                  DomainName: "www.example.test",
                  HostedZoneId: { Ref: "Zone" },
                },
              ],
            },
          },
        },
      },
    });

    // When the deployment completes.
    await stack.waitForDeployComplete();

    const certificateArn = simAws.acm().certificates.keys().next().value;
    assertNonNullable(certificateArn);

    // Then both domains validated and the certificate is issued.
    const describeOutput = await simAws
      .acm()
      .describeCertificate(
        new DescribeCertificateCommand({ CertificateArn: certificateArn }),
      );
    assertIdentical(describeOutput.Certificate?.Status, "ISSUED");
    assertArrayLength(describeOutput.Certificate.DomainValidationOptions, 2);
  });

  it("fails the stack when the certificate cannot be validated", async () => {
    // Given a template with a hosted zone covering the certificate domain,
    // but no HostedZoneId telling CloudFormation to publish the record.
    const simAws = new SimAws();

    // When the template is deployed.
    const error = await assertThrowsErrorAsync(async () => {
      const stack = await simAws.cloudFormation().deployTemplate({
        stackName: "acm-unvalidatable-stack",
        template: {
          Resources: {
            Zone: {
              Type: "AWS::Route53::HostedZone",
              Properties: { Name: "example.test" },
            },
            SiteCertificate: {
              Type: "AWS::CertificateManager::Certificate",
              Properties: {
                DomainName: "api.example.test",
                ValidationMethod: "DNS",
              },
              DependsOn: "Zone",
            },
          },
        },
      });
      await stack.waitForDeployComplete();
    });

    // Then the failure names the resource and the record it waited for.
    assertStringIncludes(error.message, "SiteCertificate");
    assertStringIncludes(error.message, "_yulin-acm-");
    assertStringIncludes(
      error.message,
      "DomainValidationOptions[].HostedZoneId",
    );
  });
});

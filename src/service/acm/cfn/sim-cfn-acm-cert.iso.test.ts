import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringStartsWith,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import {
  DescribeCertificateCommand,
  ListCertificatesCommand,
} from "@aws-sdk/client-acm";

describe("Sim ACM CloudFormation Certificate", () => {
  it("deploys an ACM Certificate and exposes CloudFormation values", async () => {
    // Given a sim CloudFormation template with an ACM Certificate and Outputs
    // for its Ref and supported GetAtt values.
    const simAws = new SimAws();

    // When the template is deployed through sim CloudFormation.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "acm-certificate-values-stack",
      template: {
        Resources: {
          SiteCertificate: {
            Type: "AWS::CertificateManager::Certificate",
            Properties: {
              DomainName: "example.test",
              ValidationMethod: "DNS",
            },
          },
        },
        Outputs: {
          CertificateRef: {
            Value: {
              Ref: "SiteCertificate",
            },
          },
          CertificateArn: {
            Value: {
              "Fn::GetAtt": ["SiteCertificate", "CertificateArn"],
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

    // Then the CloudFormation Outputs expose the simulated certificate values.
    const certificateRef = stack.outputs.get("CertificateRef")?.value;
    const certificateArn = stack.outputs.get("CertificateArn")?.value;

    assertStringStartsWith(certificateRef, "arn:aws:acm:");
    assertIdentical(certificateArn, certificateRef);
    assertIdentical(
      stack.outputs.get("CertificateStatus")?.value,
      "PENDING_VALIDATION",
    );

    // And the certificate can be found through the sim ACM list-certificates
    // command.
    await simAws.backgroundTasksComplete();

    const listOutput = await simAws
      .acm()
      .listCertificates(new ListCertificatesCommand());

    assertArrayLength(listOutput.CertificateSummaryList, 1);
    assertIdentical(
      listOutput.CertificateSummaryList[0].CertificateArn,
      certificateArn,
    );
    assertIdentical(
      listOutput.CertificateSummaryList[0].DomainName,
      "example.test",
    );
    assertIdentical(listOutput.CertificateSummaryList[0].Status, "ISSUED");
  });

  it("deploys an ACM Certificate with DNS validation details", async () => {
    // Given a sim CloudFormation template with an ACM Certificate using DNS
    // validation, subject alternative names, domain validation options, and tags.
    const simAws = new SimAws();

    // When the template is deployed through sim CloudFormation.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "acm-certificate-dns-validation-stack",
      template: {
        Resources: {
          SiteCertificate: {
            Type: "AWS::CertificateManager::Certificate",
            Properties: {
              DomainName: "example.test",
              SubjectAlternativeNames: [
                "www.example.test",
                "assets.example.test",
              ],
              ValidationMethod: "DNS",
              DomainValidationOptions: [
                {
                  DomainName: "example.test",
                  ValidationDomain: "example.test",
                },
                {
                  DomainName: "www.example.test",
                  ValidationDomain: "example.test",
                },
              ],
              Tags: [
                {
                  Key: "Purpose",
                  Value: "iso-test",
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
        },
      },
    });

    // Then describe-certificate returns the deployed certificate details.
    await simAws.backgroundTasksComplete();

    const certificateArn = stack.outputs.get("CertificateArn")?.value;
    assertStringStartsWith(certificateArn, "arn:aws:acm:");

    const describeOutput = await simAws.acm().describeCertificate(
      new DescribeCertificateCommand({
        CertificateArn: certificateArn,
      }),
    );

    const certificate = describeOutput.Certificate;
    assertNonNullable(certificate);
    assertIdentical(certificate.CertificateArn, certificateArn);
    assertIdentical(certificate.DomainName, "example.test");
    assertIdentical(certificate.Status, "ISSUED");
    assertIdentical(certificate.Type, "AMAZON_ISSUED");
    assertIdentical(certificate.KeyAlgorithm, "RSA-2048");
    assertIdentical(certificate.SignatureAlgorithm, "SHA256WITHRSA");
    assertArrayLength(certificate.SubjectAlternativeNames, 2);
    assertIdentical(certificate.SubjectAlternativeNames[0], "www.example.test");
    assertIdentical(
      certificate.SubjectAlternativeNames[1],
      "assets.example.test",
    );

    // And DNS validation records are available for the primary domain and each
    // subject alternative name.
    assertArrayLength(certificate.DomainValidationOptions, 3);

    const primaryValidation = certificate.DomainValidationOptions[0];
    assertIdentical(primaryValidation.DomainName, "example.test");
    assertIdentical(primaryValidation.ValidationMethod, "DNS");
    assertIdentical(primaryValidation.ValidationStatus, "ISSUED");
    assertStringStartsWith(
      primaryValidation.ResourceRecord?.Name,
      "_yulin-acm-",
    );
    assertIdentical(primaryValidation.ResourceRecord.Type, "CNAME");
    assertStringStartsWith(
      primaryValidation.ResourceRecord.Value,
      "_yulin-acm-",
    );

    assertIdentical(
      certificate.DomainValidationOptions[1].DomainName,
      "www.example.test",
    );
    assertIdentical(
      certificate.DomainValidationOptions[2].DomainName,
      "assets.example.test",
    );
  });

  it("deploys an ACM Certificate with EMAIL validation", async () => {
    // Given a sim CloudFormation template with an ACM Certificate using EMAIL
    // validation.
    const simAws = new SimAws();

    // When the template is deployed through sim CloudFormation.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "acm-certificate-email-validation-stack",
      template: {
        Resources: {
          EmailCertificate: {
            Type: "AWS::CertificateManager::Certificate",
            Properties: {
              DomainName: "mail.example.test",
              ValidationMethod: "EMAIL",
            },
          },
        },
        Outputs: {
          CertificateArn: {
            Value: {
              Ref: "EmailCertificate",
            },
          },
        },
      },
    });

    // Then describe-certificate shows EMAIL validation without DNS resource
    // records.
    await simAws.backgroundTasksComplete();

    const certificateArn = stack.outputs.get("CertificateArn")?.value;
    assertStringStartsWith(certificateArn, "arn:aws:acm:");

    const describeOutput = await simAws.acm().describeCertificate(
      new DescribeCertificateCommand({
        CertificateArn: certificateArn,
      }),
    );

    const validation = describeOutput.Certificate?.DomainValidationOptions?.[0];

    assertIdentical(
      describeOutput.Certificate?.DomainName,
      "mail.example.test",
    );
    assertIdentical(describeOutput.Certificate.Status, "ISSUED");
    assertIdentical(validation?.DomainName, "mail.example.test");
    assertIdentical(validation.ValidationMethod, "EMAIL");
    assertUndefined(validation.ResourceRecord);
  });

  it("records unsupported ACM CloudFormation resource types as skipped", async () => {
    // Given a sim CloudFormation template with an unsupported ACM resource type.
    const simAws = new SimAws();

    // When the template is deployed through sim CloudFormation.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "unsupported-acm-resource-stack",
      template: {
        Resources: {
          UnsupportedAcmResource: {
            Type: "AWS::CertificateManager::UnsupportedResource",
          },
        },
      },
    });

    // Then the Stack completes, but records the unsupported resource as skipped.
    const skippedResource = stack.skippedResources[0];

    assertIdentical(stack.lifecycle.status, "CREATE_COMPLETE");
    assertArrayLength(stack.skippedResources, 1);
    assertNonNullable(skippedResource);
    assertIdentical(skippedResource.logicalId, "UnsupportedAcmResource");
    assertTrue(skippedResource.skipped);
    assertIdentical(
      skippedResource.skippedReason,
      "Unsupported sim ACM CloudFormation Resource UnsupportedResource",
    );
  });
});

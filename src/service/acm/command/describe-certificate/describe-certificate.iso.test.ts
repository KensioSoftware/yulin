import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertStringStartsWith,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimAcmResourceNotFoundException } from "../../error/sim-acm.error.js";
import {
  DescribeCertificateCommand,
  RequestCertificateCommand,
} from "@aws-sdk/client-acm";

describe("ACM DescribeCertificateCommand", () => {
  it("describes a requested DNS validated certificate", async () => {
    // Given ACM with a requested certificate.
    const simAws = new SimAws();
    const simAcm = simAws.account("555555555555").region("eu-west-1").acm();

    const requestOutput = await simAcm.requestCertificate(
      new RequestCertificateCommand({
        DomainName: "example.com",
      }),
    );
    assertNonNullable(requestOutput.CertificateArn);

    // When the certificate is described.
    const describeOutput = await simAcm.describeCertificate(
      new DescribeCertificateCommand({
        CertificateArn: requestOutput.CertificateArn,
      }),
    );

    // Then the certificate detail is returned.
    assertNonNullable(describeOutput.Certificate);
    assertIdentical(
      describeOutput.Certificate.CertificateArn,
      "arn:aws:acm:eu-west-1:555555555555:certificate/00000001",
    );
    assertIdentical(describeOutput.Certificate.DomainName, "example.com");
    assertArrayLength(describeOutput.Certificate.SubjectAlternativeNames, 0);
    assertIdentical(describeOutput.Certificate.Status, "PENDING_VALIDATION");
    assertIdentical(describeOutput.Certificate.Type, "AMAZON_ISSUED");
    assertIdentical(describeOutput.Certificate.KeyAlgorithm, "RSA-2048");
    assertIdentical(
      describeOutput.Certificate.SignatureAlgorithm,
      "SHA256WITHRSA",
    );
    assertArrayLength(describeOutput.Certificate.InUseBy, 0);
    assertNonNullable(describeOutput.Certificate.CreatedAt);
    assertUndefined(describeOutput.Certificate.IssuedAt);
  });

  it("describes subject alternative names and DNS validation records", async () => {
    // Given ACM with a requested certificate that has alternative names.
    const simAws = new SimAws();
    const simAcm = simAws.acm();

    const requestOutput = await simAcm.requestCertificate(
      new RequestCertificateCommand({
        DomainName: "example.com",
        SubjectAlternativeNames: ["www.example.com", "api.example.com"],
      }),
    );
    assertNonNullable(requestOutput.CertificateArn);

    // When the certificate is described.
    const describeOutput = await simAcm.describeCertificate(
      new DescribeCertificateCommand({
        CertificateArn: requestOutput.CertificateArn,
      }),
    );

    // Then all requested names have DNS validation details.
    assertNonNullable(describeOutput.Certificate);
    assertArrayLength(describeOutput.Certificate.SubjectAlternativeNames, 2);
    assertIdentical(
      describeOutput.Certificate.SubjectAlternativeNames[0],
      "www.example.com",
    );
    assertIdentical(
      describeOutput.Certificate.SubjectAlternativeNames[1],
      "api.example.com",
    );

    assertArrayLength(describeOutput.Certificate.DomainValidationOptions, 3);
    assertIdentical(
      describeOutput.Certificate.DomainValidationOptions[0].DomainName,
      "example.com",
    );
    assertIdentical(
      describeOutput.Certificate.DomainValidationOptions[1].DomainName,
      "www.example.com",
    );
    assertIdentical(
      describeOutput.Certificate.DomainValidationOptions[2].DomainName,
      "api.example.com",
    );

    for (const option of describeOutput.Certificate.DomainValidationOptions) {
      assertIdentical(option.ValidationMethod, "DNS");
      assertIdentical(option.ValidationStatus, "PENDING_VALIDATION");
      assertNonNullable(option.ResourceRecord);
      assertStringStartsWith(option.ResourceRecord.Name, "_yulin-acm-");
      assertIdentical(option.ResourceRecord.Type, "CNAME");
      assertStringIncludes(
        option.ResourceRecord.Value,
        ".acm-validations.aws.",
      );
    }
  });

  it("describes EMAIL validation without DNS resource records", async () => {
    // Given ACM with an EMAIL validated certificate.
    const simAws = new SimAws();
    const simAcm = simAws.acm();

    const requestOutput = await simAcm.requestCertificate(
      new RequestCertificateCommand({
        DomainName: "email.example.com",
        ValidationMethod: "EMAIL",
      }),
    );
    assertNonNullable(requestOutput.CertificateArn);

    // When the certificate is described.
    const describeOutput = await simAcm.describeCertificate(
      new DescribeCertificateCommand({
        CertificateArn: requestOutput.CertificateArn,
      }),
    );

    // Then the validation method is EMAIL and no DNS record is included.
    assertNonNullable(describeOutput.Certificate);
    assertArrayLength(describeOutput.Certificate.DomainValidationOptions, 1);
    assertIdentical(
      describeOutput.Certificate.DomainValidationOptions[0].DomainName,
      "email.example.com",
    );
    assertIdentical(
      describeOutput.Certificate.DomainValidationOptions[0].ValidationMethod,
      "EMAIL",
    );
    assertIdentical(
      describeOutput.Certificate.DomainValidationOptions[0].ValidationStatus,
      "PENDING_VALIDATION",
    );
    assertUndefined(
      describeOutput.Certificate.DomainValidationOptions[0].ResourceRecord,
    );
  });

  it("describes an issued certificate after background issuance", async () => {
    // Given ACM with a requested certificate.
    const simAws = new SimAws();
    const simAcm = simAws.acm();

    const requestOutput = await simAcm.requestCertificate(
      new RequestCertificateCommand({
        DomainName: "issued.example.com",
      }),
    );
    assertNonNullable(requestOutput.CertificateArn);

    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    // When the certificate is described after background issuance.
    const describeOutput = await simAcm.describeCertificate(
      new DescribeCertificateCommand({
        CertificateArn: requestOutput.CertificateArn,
      }),
    );

    // Then the certificate detail shows ISSUED status.
    assertNonNullable(describeOutput.Certificate);
    assertIdentical(describeOutput.Certificate.Status, "ISSUED");
    assertNonNullable(describeOutput.Certificate.IssuedAt);
    assertArrayLength(describeOutput.Certificate.DomainValidationOptions, 1);
    assertIdentical(
      describeOutput.Certificate.DomainValidationOptions[0].ValidationStatus,
      "ISSUED",
    );
  });

  it("throws when CertificateArn is missing", async () => {
    // Given ACM.
    const simAws = new SimAws();
    const simAcm = simAws.acm();

    // When a certificate is described without an ARN.
    const error = await assertThrowsErrorAsync(async () =>
      simAcm.describeCertificate(
        new DescribeCertificateCommand({
          CertificateArn: undefined,
        }),
      ),
    );

    // Then the request is rejected.
    assertInstanceOf(error, Error);
    assertStringIncludes(error.message, "CertificateArn required");
  });

  it("throws ResourceNotFoundException when the certificate does not exist", async () => {
    // Given ACM with no matching certificate.
    const simAws = new SimAws();
    const simAcm = simAws.account("555555555555").region("eu-west-1").acm();

    // When a non-existent certificate ARN is described.
    const error = await assertThrowsErrorAsync(async () =>
      simAcm.describeCertificate(
        new DescribeCertificateCommand({
          CertificateArn:
            "arn:aws:acm:eu-west-1:555555555555:certificate/does-not-exist",
        }),
      ),
    );

    // Then ACM returns ResourceNotFoundException.
    assertInstanceOf(error, SimAcmResourceNotFoundException);
    assertIdentical(error.name, "ResourceNotFoundException");
    assertIdentical(error.$metadata.httpStatusCode, 400);
    assertStringIncludes(error.message, "does-not-exist");
  });
});

import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimAcmInvalidArgsException,
  SimAcmTooManyTagsException,
} from "../../error/sim-acm.error.js";

describe("ACM RequestCertificateCommand", () => {
  it("requests a certificate for a domain name", async () => {
    // Given ACM in a known account and region.
    const simAws = new SimAws();
    const simAcm = simAws.account("555555555555").region("eu-west-1").acm();

    // When a certificate is requested for a domain name.
    const requestOutput = await simAcm.requestCertificate({
      input: {
        DomainName: "example.com",
      },
    });

    // Then the certificate ARN is returned and the certificate is present.
    assertIdentical(
      requestOutput.CertificateArn,
      "arn:aws:acm:eu-west-1:555555555555:certificate/00000001",
    );

    const listOutput = await simAcm.listCertificates({
      input: {},
    });

    assertArrayLength(listOutput.CertificateSummaryList, 1);
    assertIdentical(
      listOutput.CertificateSummaryList[0].CertificateArn,
      requestOutput.CertificateArn,
    );
    assertIdentical(
      listOutput.CertificateSummaryList[0].DomainName,
      "example.com",
    );
    assertIdentical(
      listOutput.CertificateSummaryList[0].Status,
      "PENDING_VALIDATION",
    );
  });

  it("requests a certificate with subject alternative names", async () => {
    // Given ACM.
    const simAws = new SimAws();
    const simAcm = simAws.region("me-south-1").acm();

    // When a certificate is requested with subject alternative names.
    const requestOutput = await simAcm.requestCertificate({
      input: {
        DomainName: "example.com",
        SubjectAlternativeNames: ["www.example.com", "api.example.com"],
      },
    });

    // Then the certificate summary includes the requested names.
    assertNonNullable(requestOutput.CertificateArn);

    const listOutput = await simAcm.listCertificates({
      input: {},
    });

    assertArrayLength(listOutput.CertificateSummaryList, 1);
    assertIdentical(
      listOutput.CertificateSummaryList[0].CertificateArn,
      requestOutput.CertificateArn,
    );
    assertIdentical(
      listOutput.CertificateSummaryList[0].DomainName,
      "example.com",
    );
    assertArrayLength(
      listOutput.CertificateSummaryList[0].SubjectAlternativeNameSummaries,
      2,
    );
    assertIdentical(
      listOutput.CertificateSummaryList[0].SubjectAlternativeNameSummaries[0],
      "www.example.com",
    );
    assertIdentical(
      listOutput.CertificateSummaryList[0].SubjectAlternativeNameSummaries[1],
      "api.example.com",
    );
  });

  it("allows multiple certificates for the same domain", async () => {
    // Given ACM.
    const simAws = new SimAws();
    const simAcm = simAws.account("123456789012").acm();

    // When the same domain is requested twice.
    const firstOutput = await simAcm.requestCertificate({
      input: {
        DomainName: "duplicate.example.com",
      },
    });
    const secondOutput = await simAcm.requestCertificate({
      input: {
        DomainName: "duplicate.example.com",
      },
    });

    // Then both requests succeed with distinct certificate ARNs.
    assertIdentical(
      firstOutput.CertificateArn,
      "arn:aws:acm:us-east-1:123456789012:certificate/00000001",
    );
    assertIdentical(
      secondOutput.CertificateArn,
      "arn:aws:acm:us-east-1:123456789012:certificate/00000002",
    );

    const listOutput = await simAcm.listCertificates({
      input: {},
    });

    assertArrayLength(listOutput.CertificateSummaryList, 2);
    assertIdentical(
      listOutput.CertificateSummaryList[0].CertificateArn,
      firstOutput.CertificateArn,
    );
    assertIdentical(
      listOutput.CertificateSummaryList[1].CertificateArn,
      secondOutput.CertificateArn,
    );
    assertIdentical(
      listOutput.CertificateSummaryList[0].DomainName,
      "duplicate.example.com",
    );
    assertIdentical(
      listOutput.CertificateSummaryList[1].DomainName,
      "duplicate.example.com",
    );
  });

  it("throws InvalidArgsException when DomainName is missing", async () => {
    // Given ACM.
    const simAws = new SimAws();
    const simAcm = simAws.acm();

    // When a certificate is requested without a domain name.
    const error = await assertThrowsErrorAsync(async () =>
      simAcm.requestCertificate({
        input: {},
      }),
    );

    // Then ACM rejects the request as invalid.
    assertInstanceOf(error, SimAcmInvalidArgsException);
    assertIdentical(error.name, "InvalidArgsException");
    assertIdentical(error.$metadata.httpStatusCode, 400);
    assertStringIncludes(error.message, "DomainName required");
  });

  it("throws InvalidArgsException when DomainName is empty", async () => {
    // Given ACM.
    const simAws = new SimAws();
    const simAcm = simAws.acm();

    // When a certificate is requested with an empty domain name.
    const error = await assertThrowsErrorAsync(async () =>
      simAcm.requestCertificate({
        input: {
          DomainName: "",
        },
      }),
    );

    // Then ACM rejects the request as invalid.
    assertInstanceOf(error, SimAcmInvalidArgsException);
    assertIdentical(error.name, "InvalidArgsException");
    assertIdentical(error.$metadata.httpStatusCode, 400);
    assertStringIncludes(error.message, "DomainName required");
  });

  it("throws TooManyTagsException when more than 50 tags are requested", async () => {
    // Given ACM and too many request tags.
    const simAws = new SimAws();
    const simAcm = simAws.acm();

    const tags = Array.from({ length: 51 }, (_, index) => ({
      Key: `key-${String(index)}`,
      Value: `value-${String(index)}`,
    }));

    // When a certificate is requested with too many tags.
    const error = await assertThrowsErrorAsync(async () =>
      simAcm.requestCertificate({
        input: {
          DomainName: "too-many-tags.example.com",
          Tags: tags,
        },
      }),
    );

    // Then ACM rejects the request with the tag limit error.
    assertInstanceOf(error, SimAcmTooManyTagsException);
    assertIdentical(error.name, "TooManyTagsException");
    assertIdentical(error.$metadata.httpStatusCode, 400);
    assertStringIncludes(error.message, "more than 50 tags");
  });

  it("accepts 50 tags on a requested certificate", async () => {
    // Given ACM and the maximum allowed number of tags.
    const simAws = new SimAws();
    const simAcm = simAws.acm();

    const tags = Array.from({ length: 50 }, (_, index) => ({
      Key: `key-${String(index)}`,
      Value: `value-${String(index)}`,
    }));

    // When a certificate is requested with exactly 50 tags.
    const requestOutput = await simAcm.requestCertificate({
      input: {
        DomainName: "fifty-tags.example.com",
        Tags: tags,
      },
    });

    // Then the request succeeds and the certificate is present.
    assertNonNullable(requestOutput.CertificateArn);

    const listOutput = await simAcm.listCertificates({
      input: {},
    });

    assertArrayLength(listOutput.CertificateSummaryList, 1);
    assertIdentical(
      listOutput.CertificateSummaryList[0].CertificateArn,
      requestOutput.CertificateArn,
    );
    assertIdentical(
      listOutput.CertificateSummaryList[0].DomainName,
      "fifty-tags.example.com",
    );
  });
});

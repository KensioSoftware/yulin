import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";

describe("ACM ListCertificatesCommand", () => {
  it("lists no certificates when ACM has none", async () => {
    // Given ACM with no certificates.
    const simAws = new SimAws();
    const simAcm = simAws.acm();

    // When certificates are listed.
    const listOutput = await simAcm.listCertificates({
      input: {},
    });

    // Then an empty certificate summary list is returned.
    assertArrayLength(listOutput.CertificateSummaryList, 0);
    assertUndefined(listOutput.NextToken);
  });

  it("lists requested certificates in creation order", async () => {
    // Given ACM with multiple requested certificates.
    const simAws = new SimAws();
    const simAcm = simAws.account("555555555555").region("eu-west-1").acm();

    const firstOutput = await simAcm.requestCertificate({
      input: {
        DomainName: "one.example.com",
      },
    });
    const secondOutput = await simAcm.requestCertificate({
      input: {
        DomainName: "two.example.com",
      },
    });
    const thirdOutput = await simAcm.requestCertificate({
      input: {
        DomainName: "three.example.com",
      },
    });

    // When certificates are listed.
    const listOutput = await simAcm.listCertificates({
      input: {},
    });

    // Then the certificate summaries are returned in creation order.
    assertArrayLength(listOutput.CertificateSummaryList, 3);
    assertIdentical(
      listOutput.CertificateSummaryList[0].CertificateArn,
      firstOutput.CertificateArn,
    );
    assertIdentical(
      listOutput.CertificateSummaryList[0].CertificateArn,
      "arn:aws:acm:eu-west-1:555555555555:certificate/00000001",
    );
    assertIdentical(
      listOutput.CertificateSummaryList[0].DomainName,
      "one.example.com",
    );
    assertIdentical(
      listOutput.CertificateSummaryList[1].CertificateArn,
      secondOutput.CertificateArn,
    );
    assertIdentical(
      listOutput.CertificateSummaryList[1].DomainName,
      "two.example.com",
    );
    assertIdentical(
      listOutput.CertificateSummaryList[2].CertificateArn,
      thirdOutput.CertificateArn,
    );
    assertIdentical(
      listOutput.CertificateSummaryList[2].DomainName,
      "three.example.com",
    );
    assertUndefined(listOutput.NextToken);
  });

  it("returns certificate summary fields", async () => {
    // Given ACM with a requested certificate.
    const simAws = new SimAws();
    const simAcm = simAws.acm();

    const requestOutput = await simAcm.requestCertificate({
      input: {
        DomainName: "summary.example.com",
        SubjectAlternativeNames: ["www.summary.example.com"],
      },
    });

    // When certificates are listed.
    const listOutput = await simAcm.listCertificates({
      input: {},
    });

    // Then the certificate summary contains the expected fields.
    assertArrayLength(listOutput.CertificateSummaryList, 1);
    assertIdentical(
      listOutput.CertificateSummaryList[0].CertificateArn,
      requestOutput.CertificateArn,
    );
    assertIdentical(
      listOutput.CertificateSummaryList[0].DomainName,
      "summary.example.com",
    );
    assertArrayLength(
      listOutput.CertificateSummaryList[0].SubjectAlternativeNameSummaries,
      1,
    );
    assertIdentical(
      listOutput.CertificateSummaryList[0].SubjectAlternativeNameSummaries[0],
      "www.summary.example.com",
    );
    assertFalse(
      listOutput.CertificateSummaryList[0].HasAdditionalSubjectAlternativeNames,
    );
    assertIdentical(
      listOutput.CertificateSummaryList[0].Status,
      "PENDING_VALIDATION",
    );
    assertIdentical(listOutput.CertificateSummaryList[0].Type, "TEST_ISSUED");
    assertIdentical(
      listOutput.CertificateSummaryList[0].KeyAlgorithm,
      "RSA-2048",
    );
    assertFalse(listOutput.CertificateSummaryList[0].InUse);
    assertNonNullable(listOutput.CertificateSummaryList[0].CreatedAt);
    assertUndefined(listOutput.CertificateSummaryList[0].IssuedAt);
  });

  it("truncates subject alternative name summaries after 100 names", async () => {
    // Given ACM with a certificate that has more than 100 subject alternative names.
    const simAws = new SimAws();
    const simAcm = simAws.acm();

    const subjectAlternativeNames = Array.from(
      { length: 101 },
      (_, index) => `san-${String(index).padStart(3, "0")}.example.com`,
    );

    await simAcm.requestCertificate({
      input: {
        DomainName: "many-sans.example.com",
        SubjectAlternativeNames: subjectAlternativeNames,
      },
    });

    // When certificates are listed.
    const listOutput = await simAcm.listCertificates({
      input: {},
    });

    // Then only the first 100 subject alternative names are summarized.
    assertArrayLength(listOutput.CertificateSummaryList, 1);
    assertArrayLength(
      listOutput.CertificateSummaryList[0].SubjectAlternativeNameSummaries,
      100,
    );
    assertIdentical(
      listOutput.CertificateSummaryList[0].SubjectAlternativeNameSummaries[0],
      "san-000.example.com",
    );
    assertIdentical(
      listOutput.CertificateSummaryList[0].SubjectAlternativeNameSummaries[99],
      "san-099.example.com",
    );
    assertTrue(
      listOutput.CertificateSummaryList[0].HasAdditionalSubjectAlternativeNames,
    );
  });
});

import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimAcmInvalidArgumentsException } from "../../error/sim-acm.error.js";
import {
  ListCertificatesCommand,
  RequestCertificateCommand,
} from "@aws-sdk/client-acm";

describe("ACM ListCertificatesCommand pagination and filters", () => {
  it("filters certificates by PENDING_VALIDATION status", async () => {
    // Given ACM with newly requested certificates.
    const simAws = new SimAws();
    const simAcm = simAws.acm();

    await simAcm.requestCertificate(
      new RequestCertificateCommand({
        DomainName: "one-pending.example.com",
      }),
    );
    await simAcm.requestCertificate(
      new RequestCertificateCommand({
        DomainName: "two-pending.example.com",
      }),
    );

    // When certificates are listed with the PENDING_VALIDATION status filter.
    const listOutput = await simAcm.listCertificates(
      new ListCertificatesCommand({
        CertificateStatuses: ["PENDING_VALIDATION"],
      }),
    );

    // Then only pending certificates are returned.
    assertArrayLength(listOutput.CertificateSummaryList, 2);
    assertIdentical(
      listOutput.CertificateSummaryList[0].Status,
      "PENDING_VALIDATION",
    );
    assertIdentical(
      listOutput.CertificateSummaryList[1].Status,
      "PENDING_VALIDATION",
    );
  });

  it("filters certificates by ISSUED status", async () => {
    // Given ACM with a requested certificate.
    const simAws = new SimAws();
    const simAcm = simAws.acm();

    await simAcm.requestCertificate(
      new RequestCertificateCommand({
        DomainName: "issued.example.com",
      }),
    );

    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    // When certificates are listed with the ISSUED status filter.
    const listOutput = await simAcm.listCertificates(
      new ListCertificatesCommand({
        CertificateStatuses: ["ISSUED"],
      }),
    );

    // Then issued certificates are returned.
    assertArrayLength(listOutput.CertificateSummaryList, 1);
    assertIdentical(
      listOutput.CertificateSummaryList[0].DomainName,
      "issued.example.com",
    );
    assertIdentical(listOutput.CertificateSummaryList[0].Status, "ISSUED");
    assertNonNullable(listOutput.CertificateSummaryList[0].IssuedAt);
  });

  it("paginates certificates using MaxItems and NextToken", async () => {
    // Given ACM with more certificates than the requested page size.
    const simAws = new SimAws();
    const simAcm = simAws.acm();

    await simAcm.requestCertificate(
      new RequestCertificateCommand({
        DomainName: "one.example.com",
      }),
    );
    await simAcm.requestCertificate(
      new RequestCertificateCommand({
        DomainName: "two.example.com",
      }),
    );
    await simAcm.requestCertificate(
      new RequestCertificateCommand({
        DomainName: "three.example.com",
      }),
    );

    // When certificates are listed with a two-item page size.
    const firstPageOutput = await simAcm.listCertificates(
      new ListCertificatesCommand({
        MaxItems: 2,
      }),
    );

    // Then the first page includes a token for the remaining certificates.
    assertArrayLength(firstPageOutput.CertificateSummaryList, 2);
    assertIdentical(
      firstPageOutput.CertificateSummaryList[0].DomainName,
      "one.example.com",
    );
    assertIdentical(
      firstPageOutput.CertificateSummaryList[1].DomainName,
      "two.example.com",
    );
    assertIdentical(firstPageOutput.NextToken, "2");

    // When the next page is requested with the token.
    const secondPageOutput = await simAcm.listCertificates(
      new ListCertificatesCommand({
        MaxItems: 2,
        NextToken: firstPageOutput.NextToken,
      }),
    );

    // Then the remaining certificate is returned and pagination ends.
    assertArrayLength(secondPageOutput.CertificateSummaryList, 1);
    assertIdentical(
      secondPageOutput.CertificateSummaryList[0].DomainName,
      "three.example.com",
    );
    assertUndefined(secondPageOutput.NextToken);
  });

  it("returns an empty page when NextToken starts after the last certificate", async () => {
    // Given ACM with one certificate.
    const simAws = new SimAws();
    const simAcm = simAws.acm();

    await simAcm.requestCertificate(
      new RequestCertificateCommand({
        DomainName: "one.example.com",
      }),
    );

    // When certificates are listed from a token after the last certificate.
    const listOutput = await simAcm.listCertificates(
      new ListCertificatesCommand({
        NextToken: "1",
      }),
    );

    // Then an empty page is returned.
    assertArrayLength(listOutput.CertificateSummaryList, 0);
    assertUndefined(listOutput.NextToken);
  });

  it("throws InvalidArgsException when MaxItems is zero", async () => {
    // Given ACM.
    const simAws = new SimAws();
    const simAcm = simAws.acm();

    // When certificates are listed with an invalid page size.
    const error = await assertThrowsErrorAsync(async () =>
      simAcm.listCertificates(
        new ListCertificatesCommand({
          MaxItems: 0,
        }),
      ),
    );

    // Then ACM rejects the request as invalid.
    assertInstanceOf(error, SimAcmInvalidArgumentsException);
    assertIdentical(error.name, "InvalidArgsException");
    assertIdentical(error.$metadata.httpStatusCode, 400);
    assertStringIncludes(error.message, "MaxItems");
  });

  it("throws InvalidArgsException when MaxItems is greater than 1000", async () => {
    // Given ACM.
    const simAws = new SimAws();
    const simAcm = simAws.acm();

    // When certificates are listed with a page size above the maximum.
    const error = await assertThrowsErrorAsync(async () =>
      simAcm.listCertificates(
        new ListCertificatesCommand({
          MaxItems: 1001,
        }),
      ),
    );

    // Then ACM rejects the request as invalid.
    assertInstanceOf(error, SimAcmInvalidArgumentsException);
    assertIdentical(error.name, "InvalidArgsException");
    assertIdentical(error.$metadata.httpStatusCode, 400);
    assertStringIncludes(error.message, "MaxItems");
  });

  it("throws InvalidArgsException when MaxItems is not an integer", async () => {
    // Given ACM.
    const simAws = new SimAws();
    const simAcm = simAws.acm();

    // When certificates are listed with a fractional page size.
    const error = await assertThrowsErrorAsync(async () =>
      simAcm.listCertificates(
        new ListCertificatesCommand({
          MaxItems: 1.5,
        }),
      ),
    );

    // Then ACM rejects the request as invalid.
    assertInstanceOf(error, SimAcmInvalidArgumentsException);
    assertIdentical(error.name, "InvalidArgsException");
    assertIdentical(error.$metadata.httpStatusCode, 400);
    assertStringIncludes(error.message, "MaxItems");
  });

  it("throws InvalidArgsException when NextToken is invalid", async () => {
    // Given ACM.
    const simAws = new SimAws();
    const simAcm = simAws.acm();

    // When certificates are listed with an invalid next token.
    const error = await assertThrowsErrorAsync(async () =>
      simAcm.listCertificates(
        new ListCertificatesCommand({
          NextToken: "not-a-token",
        }),
      ),
    );

    // Then ACM rejects the request as invalid.
    assertInstanceOf(error, SimAcmInvalidArgumentsException);
    assertIdentical(error.name, "InvalidArgsException");
    assertIdentical(error.$metadata.httpStatusCode, 400);
    assertStringIncludes(error.message, "NextToken");
  });
});

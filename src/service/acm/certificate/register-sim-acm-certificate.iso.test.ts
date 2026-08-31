import {
  assertArrayEmpty,
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertMapSize,
  assertNonNullable,
  assertObjectMatches,
  assertStringIncludes,
  assertThrowsError,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import {
  DescribeCertificateCommand,
  ListCertificatesCommand,
  RequestCertificateCommand,
} from "@aws-sdk/client-acm";

import { SimAws } from "../../aws/sim-aws.js";
import { SimAcmInvalidArgumentsException } from "../error/sim-acm.error.js";

// A real-shaped certificate ARN, as a CDK app that took the ARN from another
// stack would carry into its template.
const passedInCertificateArn =
  "arn:aws:acm:us-east-1:111122223333:certificate/3b82191c-b029-4e5f-a94f-038f98a53ede";

function simAcmInAccount(simAws: SimAws) {
  return simAws.account("111122223333").region("us-east-1").acm();
}

describe("Registering a simulated ACM Certificate", () => {
  it("describes the Certificate under the registered ARN", async () => {
    // Given a simulated ACM service.
    const simAws = new SimAws();
    const simAcm = simAcmInAccount(simAws);

    // When a Certificate is registered with a chosen ARN.
    simAcm.registerCertificate({
      arn: passedInCertificateArn,
      domainName: "example.test",
      subjectAlternativeNames: ["www.example.test"],
    });

    // Then it is described under that ARN, issued and needing no validation.
    const describeOutput = await simAcm.describeCertificate(
      new DescribeCertificateCommand({
        CertificateArn: passedInCertificateArn,
      }),
    );

    assertNonNullable(describeOutput.Certificate);
    assertIdentical(
      describeOutput.Certificate.CertificateArn,
      passedInCertificateArn,
    );
    assertIdentical(describeOutput.Certificate.DomainName, "example.test");
    assertArrayEquals(describeOutput.Certificate.SubjectAlternativeNames, [
      "www.example.test",
    ]);
    assertIdentical(describeOutput.Certificate.Status, "ISSUED");
    assertNonNullable(describeOutput.Certificate.IssuedAt);
    assertArrayEmpty(describeOutput.Certificate.DomainValidationOptions);
  });

  it("lists the registered Certificate under an issued status filter", async () => {
    // Given a simulated ACM service.
    const simAws = new SimAws();
    const simAcm = simAcmInAccount(simAws);

    // When a Certificate is registered.
    simAcm.registerCertificate({
      arn: passedInCertificateArn,
      domainName: "example.test",
    });

    // Then it is listed like any other issued Certificate.
    const listOutput = await simAcm.listCertificates(
      new ListCertificatesCommand({ CertificateStatuses: ["ISSUED"] }),
    );

    assertArrayLength(listOutput.CertificateSummaryList, 1);
    assertObjectMatches(listOutput.CertificateSummaryList[0], {
      CertificateArn: passedInCertificateArn,
      DomainName: "example.test",
    });
  });

  it("registers a Certificate in a status of the caller's choosing", () => {
    // Given a simulated ACM service.
    const simAws = new SimAws();
    const simAcm = simAcmInAccount(simAws);

    // When a Certificate is registered as expired.
    const certificate = simAcm.registerCertificate({
      arn: passedInCertificateArn,
      domainName: "example.test",
      status: "EXPIRED",
    });

    // Then it holds that status, with no issued time.
    assertIdentical(certificate.status, "EXPIRED");
    assertUndefined(certificate.issuedAt);
  });

  it("refuses an ARN another registered Certificate holds", () => {
    // Given a registered Certificate.
    const simAws = new SimAws();
    const simAcm = simAcmInAccount(simAws);

    simAcm.registerCertificate({
      arn: passedInCertificateArn,
      domainName: "example.test",
    });

    // When the same ARN is registered again.
    const error = assertThrowsError(() => {
      simAcm.registerCertificate({
        arn: passedInCertificateArn,
        domainName: "other.example.test",
      });
    });

    // Then the duplicate ARN is refused.
    assertInstanceOf(error, SimAcmInvalidArgumentsException);
    assertStringIncludes(error.message, passedInCertificateArn);
    assertMapSize(simAcm.certificates, 1);
  });

  it("refuses an ARN a requested Certificate already allocated", async () => {
    // Given a Certificate requested through the ACM API.
    const simAws = new SimAws();
    const simAcm = simAcmInAccount(simAws);

    const requestOutput = await simAcm.requestCertificate(
      new RequestCertificateCommand({ DomainName: "requested.example.test" }),
    );
    const requestedArn = requestOutput.CertificateArn;
    assertNonNullable(requestedArn);

    // When its allocated ARN is registered.
    const error = assertThrowsError(() => {
      simAcm.registerCertificate({
        arn: requestedArn,
        domainName: "registered.example.test",
      });
    });

    // Then the taken ARN is refused.
    assertInstanceOf(error, SimAcmInvalidArgumentsException);
    assertStringIncludes(error.message, requestedArn);
  });

  it("refuses an ARN outside its own Account and Region", () => {
    // Given a simulated ACM service in one Account and Region.
    const simAws = new SimAws();
    const simAcm = simAws.account("555555555555").region("eu-west-1").acm();

    // When a Certificate ARN from another scope is registered.
    const error = assertThrowsError(() => {
      simAcm.registerCertificate({
        arn: passedInCertificateArn,
        domainName: "example.test",
      });
    });

    // Then it is refused, naming both scopes.
    assertInstanceOf(error, SimAcmInvalidArgumentsException);
    assertStringIncludes(error.message, "111122223333");
    assertStringIncludes(error.message, "eu-west-1");
    assertMapSize(simAcm.certificates, 0);
  });

  it("refuses a string that is no ACM Certificate ARN", () => {
    // Given a simulated ACM service.
    const simAws = new SimAws();
    const simAcm = simAcmInAccount(simAws);

    // When a malformed ARN is registered.
    const error = assertThrowsError(() => {
      simAcm.registerCertificate({
        arn: "not-a-certificate-arn",
        domainName: "example.test",
      });
    });

    // Then it is refused before any Certificate exists to answer for it.
    assertInstanceOf(error, SimAcmInvalidArgumentsException);
    assertStringIncludes(error.message, "not-a-certificate-arn");
    assertMapSize(simAcm.certificates, 0);
  });

  it("allocates past a sequence ARN a registered Certificate holds", async () => {
    // Given a Certificate registered on the ARN the next allocation would take.
    const simAws = new SimAws();
    const simAcm = simAcmInAccount(simAws);

    simAcm.registerCertificate({
      arn: "arn:aws:acm:us-east-1:111122223333:certificate/00000002",
      domainName: "registered.example.test",
    });

    // When a Certificate is requested through the ACM API.
    const requestOutput = await simAcm.requestCertificate(
      new RequestCertificateCommand({ DomainName: "requested.example.test" }),
    );

    // Then it takes the next free ARN, leaving the registered one alone.
    assertIdentical(
      requestOutput.CertificateArn,
      "arn:aws:acm:us-east-1:111122223333:certificate/00000003",
    );
    assertMapSize(simAcm.certificates, 2);

    const describeOutput = await simAcm.describeCertificate(
      new DescribeCertificateCommand({
        CertificateArn:
          "arn:aws:acm:us-east-1:111122223333:certificate/00000002",
      }),
    );
    assertIdentical(
      describeOutput.Certificate?.DomainName,
      "registered.example.test",
    );
  });

  it("refuses an ACM ARN with no certificate ID", () => {
    // Given a simulated ACM service.
    const simAws = new SimAws();
    const simAcm = simAcmInAccount(simAws);

    // When an ARN naming no certificate is registered.
    const error = assertThrowsError(() => {
      simAcm.registerCertificate({
        arn: "arn:aws:acm:us-east-1:111122223333:certificate/",
        domainName: "example.test",
      });
    });

    // Then it is refused, the same as any other string that names none.
    assertInstanceOf(error, SimAcmInvalidArgumentsException);
    assertMapSize(simAcm.certificates, 0);
  });

  it("still allocates its own ARN for a requested Certificate", async () => {
    // Given a registered Certificate.
    const simAws = new SimAws();
    const simAcm = simAcmInAccount(simAws);

    simAcm.registerCertificate({
      arn: passedInCertificateArn,
      domainName: "example.test",
    });

    // When another Certificate is requested through the ACM API.
    const requestOutput = await simAcm.requestCertificate(
      new RequestCertificateCommand({ DomainName: "requested.example.test" }),
    );

    // Then its ARN is allocated by the simulator, as real ACM allocates it.
    assertIdentical(
      requestOutput.CertificateArn,
      "arn:aws:acm:us-east-1:111122223333:certificate/00000002",
    );
  });
});

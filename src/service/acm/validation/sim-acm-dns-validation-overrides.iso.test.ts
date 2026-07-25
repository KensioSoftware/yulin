import { describe, it } from "vitest";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsError,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import {
  DescribeCertificateCommand,
  RequestCertificateCommand,
} from "@aws-sdk/client-acm";

import { SimAws } from "../../aws/sim-aws.js";
import { SimAcm } from "../sim-acm.js";
import {
  SimAcmDnsValidationFailed,
  SimAcmInvalidArgumentsException,
  SimAcmResourceNotFoundException,
} from "../error/sim-acm.error.js";
import {
  certificateStatus,
  createHostedZone,
} from "./sim-acm-dns-validation.fixture.js";

describe("Sim ACM DNS validation overrides", () => {
  it("issues certificates without validation when auto issue is set", async () => {
    // Given ACM told to issue certificates without validating them.
    const simAws = new SimAws();
    await createHostedZone(simAws, "example.test");
    simAws.acm().autoIssueCertificates();

    // When a certificate is requested in the covered domain.
    const requestOutput = await simAws
      .acm()
      .requestCertificate(
        new RequestCertificateCommand({ DomainName: "api.example.test" }),
      );
    await simAws.backgroundTasksComplete();

    // Then the covering hosted zone is ignored and it is issued.
    assertIdentical(
      await certificateStatus(simAws, requestOutput.CertificateArn),
      "ISSUED",
    );
  });

  it("requires validation with no hosted zone when always is set", async () => {
    // Given ACM told to always require DNS validation.
    const simAws = new SimAws();
    simAws.acm().requireDnsValidation();

    // When a certificate is requested with no hosted zone anywhere.
    const requestOutput = await simAws
      .acm()
      .requestCertificate(
        new RequestCertificateCommand({ DomainName: "api.example.test" }),
      );
    await simAws.backgroundTasksComplete();

    // Then it waits for a validation record that nothing can publish.
    assertIdentical(
      await certificateStatus(simAws, requestOutput.CertificateArn),
      "PENDING_VALIDATION",
    );
  });

  it("reports the record that could not be published", async () => {
    // Given a certificate that always requires validation, with no zone.
    const simAws = new SimAws();
    simAws.acm().requireDnsValidation();
    const requestOutput = await simAws
      .acm()
      .requestCertificate(
        new RequestCertificateCommand({ DomainName: "api.example.test" }),
      );
    await simAws.backgroundTasksComplete();
    const certificateArn = requestOutput.CertificateArn;
    assertNonNullable(certificateArn);

    // When DNS validation is completed for it.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.acm().completeDnsValidation(certificateArn);
    });

    // Then the error names the record with nowhere to go.
    assertInstanceOf(error, SimAcmDnsValidationFailed);
    assertStringIncludes(error.message, "no sim Route53 Hosted Zone covers");
    assertStringIncludes(error.message, "_yulin-acm-");
  });

  it("completes DNS validation for a pending certificate", async () => {
    // Given a certificate pending validation in a covered domain.
    const simAws = new SimAws();
    await createHostedZone(simAws, "example.test");
    const requestOutput = await simAws
      .acm()
      .requestCertificate(
        new RequestCertificateCommand({ DomainName: "api.example.test" }),
      );
    await simAws.backgroundTasksComplete();
    assertNonNullable(requestOutput.CertificateArn);

    // When DNS validation is completed for it.
    await simAws.acm().completeDnsValidation(requestOutput.CertificateArn);

    // Then the certificate is issued by the time the call returns.
    assertIdentical(
      await certificateStatus(simAws, requestOutput.CertificateArn),
      "ISSUED",
    );
  });

  it("completes DNS validation on a standalone SimAcm with no Route53", async () => {
    // Given a certificate on standalone ACM, with no simulated DNS.
    const simAcm = new SimAcm();
    const requestOutput = await simAcm.requestCertificate(
      new RequestCertificateCommand({ DomainName: "api.example.test" }),
    );
    const certificateArn = requestOutput.CertificateArn;
    assertNonNullable(certificateArn);

    // When DNS validation is completed for it.
    await simAcm.completeDnsValidation(certificateArn);

    // Then there was nothing to publish and the certificate is issued.
    const describeOutput = await simAcm.describeCertificate(
      new DescribeCertificateCommand({ CertificateArn: certificateArn }),
    );
    assertIdentical(describeOutput.Certificate?.Status, "ISSUED");
  });

  it("completes DNS validation for a certificate with no DNS records", async () => {
    // Given an EMAIL validated certificate, which asks for no DNS record.
    const simAws = new SimAws();
    await createHostedZone(simAws, "example.test");
    const requestOutput = await simAws.acm().requestCertificate(
      new RequestCertificateCommand({
        DomainName: "api.example.test",
        ValidationMethod: "EMAIL",
      }),
    );
    await simAws.backgroundTasksComplete();
    const certificateArn = requestOutput.CertificateArn;
    assertNonNullable(certificateArn);

    // When DNS validation is completed for it.
    await simAws.acm().completeDnsValidation(certificateArn);

    // Then it stays issued, with no records published on its behalf.
    assertIdentical(await certificateStatus(simAws, certificateArn), "ISSUED");
  });

  it("throws completing DNS validation for an unknown certificate", async () => {
    // Given ACM with no certificates.
    const simAws = new SimAws();

    // When DNS validation is completed for an ARN that does not exist.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .acm()
        .completeDnsValidation(
          "arn:aws:acm:us-east-1:111111111111:certificate/00000001",
        );
    });

    // Then it reports the certificate as not found.
    assertInstanceOf(error, SimAcmResourceNotFoundException);
  });

  it("rejects requiring DNS validation with no sim Route53", () => {
    // Given standalone ACM, with no simulated DNS anywhere.
    const simAcm = new SimAcm();

    // When DNS validation is required.
    const error = assertThrowsError(() => simAcm.requireDnsValidation());

    // Then it explains that nothing could ever satisfy it.
    assertStringIncludes(error.message, "no sim Route53 to validate against");
  });

  it("throws completing DNS validation with no certificate ARN", async () => {
    // Given ACM.
    const simAws = new SimAws();

    // When DNS validation is completed without an ARN.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.acm().completeDnsValidation(undefined);
    });

    // Then it reports the missing argument.
    assertInstanceOf(error, SimAcmInvalidArgumentsException);
  });
});

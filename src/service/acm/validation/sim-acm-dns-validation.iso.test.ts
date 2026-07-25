import { describe, it } from "vitest";
import { assertIdentical, assertNonNullable } from "@kensio/smartass";
import {
  DescribeCertificateCommand,
  RequestCertificateCommand,
} from "@aws-sdk/client-acm";
import { CreateHostedZoneCommand } from "@aws-sdk/client-route-53";

import { SimAws } from "../../aws/sim-aws.js";
import { SimAcm } from "../sim-acm.js";
import { BackgroundTasks } from "../../../util/background/background.js";
import {
  certificateStatus,
  createHostedZone,
  domainValidationStatuses,
  publishCname,
  validationRecords,
} from "./sim-acm-dns-validation.fixture.js";

describe("Sim ACM DNS validation against sim Route53", () => {
  it("issues a certificate immediately when no hosted zone covers the domain", async () => {
    // Given a simulated AWS with no hosted zones at all.
    const simAws = new SimAws();

    // When a certificate is requested and background work drains.
    const requestOutput = await simAws
      .acm()
      .requestCertificate(
        new RequestCertificateCommand({ DomainName: "api.example.test" }),
      );
    await simAws.backgroundTasksComplete();

    // Then nothing in the simulation is authoritative, so it is issued.
    assertIdentical(
      await certificateStatus(simAws, requestOutput.CertificateArn),
      "ISSUED",
    );
  });

  it("holds a certificate pending when a hosted zone covers the domain", async () => {
    // Given a hosted zone covering the certificate domain.
    const simAws = new SimAws();
    await createHostedZone(simAws, "example.test");

    // When a certificate is requested and background work drains.
    const requestOutput = await simAws
      .acm()
      .requestCertificate(
        new RequestCertificateCommand({ DomainName: "api.example.test" }),
      );
    await simAws.backgroundTasksComplete();

    // Then it waits for its validation record.
    assertIdentical(
      await certificateStatus(simAws, requestOutput.CertificateArn),
      "PENDING_VALIDATION",
    );
  });

  it("issues the certificate once its validation record is published", async () => {
    // Given a pending certificate in a covered domain.
    const simAws = new SimAws();
    const hostedZoneId = await createHostedZone(simAws, "example.test");
    const requestOutput = await simAws
      .acm()
      .requestCertificate(
        new RequestCertificateCommand({ DomainName: "api.example.test" }),
      );
    await simAws.backgroundTasksComplete();

    // When the validation CNAME is published in the hosted zone.
    const [record] = await validationRecords(
      simAws,
      requestOutput.CertificateArn,
    );
    assertNonNullable(record);
    await publishCname(simAws, hostedZoneId, record);

    // Then the certificate is issued.
    assertIdentical(
      await certificateStatus(simAws, requestOutput.CertificateArn),
      "ISSUED",
    );
  });

  it("keeps the certificate pending when the record value does not match", async () => {
    // Given a pending certificate in a covered domain.
    const simAws = new SimAws();
    const hostedZoneId = await createHostedZone(simAws, "example.test");
    const requestOutput = await simAws
      .acm()
      .requestCertificate(
        new RequestCertificateCommand({ DomainName: "api.example.test" }),
      );
    await simAws.backgroundTasksComplete();

    // When a CNAME with the right name but the wrong value is published.
    const [record] = await validationRecords(
      simAws,
      requestOutput.CertificateArn,
    );
    assertNonNullable(record);
    await publishCname(
      simAws,
      hostedZoneId,
      record,
      "wrong.acm-validations.aws.",
    );

    // Then the certificate is still waiting.
    assertIdentical(
      await certificateStatus(simAws, requestOutput.CertificateArn),
      "PENDING_VALIDATION",
    );
  });

  it("issues a multi-domain certificate only once every domain is validated", async () => {
    // Given a pending certificate with a subject alternative name.
    const simAws = new SimAws();
    const hostedZoneId = await createHostedZone(simAws, "example.test");
    const requestOutput = await simAws.acm().requestCertificate(
      new RequestCertificateCommand({
        DomainName: "api.example.test",
        SubjectAlternativeNames: ["www.example.test"],
      }),
    );
    await simAws.backgroundTasksComplete();

    const [firstRecord, secondRecord] = await validationRecords(
      simAws,
      requestOutput.CertificateArn,
    );
    assertNonNullable(firstRecord);
    assertNonNullable(secondRecord);

    // When only the first domain's record is published.
    await publishCname(simAws, hostedZoneId, firstRecord);

    // Then the certificate is still pending, with per-domain statuses shown.
    assertIdentical(
      await certificateStatus(simAws, requestOutput.CertificateArn),
      "PENDING_VALIDATION",
    );
    const partialStatuses = await domainValidationStatuses(
      simAws,
      requestOutput.CertificateArn,
    );
    assertIdentical(partialStatuses[0], "SUCCESS");
    assertIdentical(partialStatuses[1], "PENDING_VALIDATION");

    // When the remaining record is published.
    await publishCname(simAws, hostedZoneId, secondRecord);

    // Then the certificate is issued.
    assertIdentical(
      await certificateStatus(simAws, requestOutput.CertificateArn),
      "ISSUED",
    );
  });

  it("validates against a hosted zone in another simulated account", async () => {
    // Given a hosted zone owned by a different simulated account.
    const simAws = new SimAws();
    await createHostedZone(simAws, "example.test", "222222222222");

    // When a certificate is requested in the default account.
    const requestOutput = await simAws
      .acm()
      .requestCertificate(
        new RequestCertificateCommand({ DomainName: "api.example.test" }),
      );
    await simAws.backgroundTasksComplete();

    // Then it waits, because ACM validates against DNS wherever it is hosted.
    assertIdentical(
      await certificateStatus(simAws, requestOutput.CertificateArn),
      "PENDING_VALIDATION",
    );

    // And publishing the record in that other account's zone issues it.
    await simAws.acm().completeDnsValidation(requestOutput.CertificateArn);
    assertIdentical(
      await certificateStatus(simAws, requestOutput.CertificateArn),
      "ISSUED",
    );
  });

  it("issues certificates from a standalone SimAcm with no Route53", async () => {
    // Given ACM on its own, with no simulated DNS anywhere.
    const background = new BackgroundTasks();
    const simAcm = new SimAcm({ background });

    // When a certificate is requested and background work drains.
    const requestOutput = await simAcm.requestCertificate(
      new RequestCertificateCommand({ DomainName: "api.example.test" }),
    );
    await background.complete();

    // Then it is issued, because there is no DNS to validate against.
    const describeOutput = await simAcm.describeCertificate(
      new DescribeCertificateCommand({
        CertificateArn: requestOutput.CertificateArn,
      }),
    );
    assertIdentical(describeOutput.Certificate?.Status, "ISSUED");
  });

  it("issues an EMAIL validated certificate without any DNS record", async () => {
    // Given a hosted zone covering the domain.
    const simAws = new SimAws();
    await createHostedZone(simAws, "example.test");

    // When an EMAIL validated certificate is requested.
    const requestOutput = await simAws.acm().requestCertificate(
      new RequestCertificateCommand({
        DomainName: "api.example.test",
        ValidationMethod: "EMAIL",
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then it is issued, because EMAIL validation is not simulated through DNS.
    assertIdentical(
      await certificateStatus(simAws, requestOutput.CertificateArn),
      "ISSUED",
    );
  });

  it("waits for a hosted zone created after the certificate was requested", async () => {
    // Given a certificate requested before any hosted zone exists.
    const simAws = new SimAws();
    const requestOutput = await simAws
      .acm()
      .requestCertificate(
        new RequestCertificateCommand({ DomainName: "api.example.test" }),
      );

    // When a covering hosted zone is created before background work drains.
    await simAws.route53().createHostedZone(
      new CreateHostedZoneCommand({
        Name: "example.test",
        CallerReference: "late-zone",
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the certificate waits for validation in that zone.
    assertIdentical(
      await certificateStatus(simAws, requestOutput.CertificateArn),
      "PENDING_VALIDATION",
    );
  });
});

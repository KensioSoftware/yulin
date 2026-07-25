import { describe, it } from "vitest";
import { assertIdentical, assertUndefined } from "@kensio/smartass";

import { SimAws } from "../../aws/sim-aws.js";
import { SimAcmRegistry } from "./sim-acm-registry.js";

describe("SimAcmRegistry", () => {
  it("finds a certificate by ARN", async () => {
    // Given a registry holding one account and region's ACM.
    const simAws = new SimAws();
    const scope = simAws.accountRegionScope().accountRegionScope;
    const acm = simAws.region(scope.regionName).acm();
    const registry = new SimAcmRegistry();
    registry.register(scope, acm);

    const output = await acm.requestCertificate({
      input: { DomainName: "example.test" },
    });
    await simAws.backgroundTasksComplete();

    // When the certificate is looked up by ARN.
    const certificate = registry.certificate(output.CertificateArn ?? "");

    // Then it is found.
    assertIdentical(certificate?.domainName, "example.test");
  });

  it("finds nothing for an ARN of another service", () => {
    // Given an empty registry.
    const registry = new SimAcmRegistry();

    // When a non-ACM ARN is looked up, then there is no certificate.
    assertUndefined(
      registry.certificate(
        "arn:aws:cloudfront::111111111111:distribution/E1234567890123",
      ),
    );
  });

  it("finds nothing for an account and region with no ACM", () => {
    // Given an empty registry.
    const registry = new SimAcmRegistry();

    // When an ACM ARN in an unregistered scope is looked up, then there is no
    // certificate.
    assertUndefined(
      registry.certificate(
        "arn:aws:acm:eu-west-2:999999999999:certificate/00000001",
      ),
    );
  });

  it("finds nothing for a value that is not an ARN", () => {
    // Given an empty registry.
    const registry = new SimAcmRegistry();

    // When a malformed ARN is looked up, then there is no certificate.
    assertUndefined(registry.certificate("not-an-arn"));
  });
});

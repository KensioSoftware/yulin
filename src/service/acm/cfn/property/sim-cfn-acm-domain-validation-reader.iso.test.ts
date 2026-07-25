import {
  assertIdentical,
  assertMapSize,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimCfnAcmDomainValidationReader } from "./sim-cfn-acm-domain-validation-reader.js";

function reader(): SimCfnAcmDomainValidationReader {
  return new SimCfnAcmDomainValidationReader({
    logicalId: "InvalidCertificate",
  });
}

describe("SimCfnAcmDomainValidationReader", () => {
  it("reads the hosted zone each domain validates through", () => {
    // Given DomainValidationOptions naming a hosted zone per domain.
    const domainValidationReader = new SimCfnAcmDomainValidationReader({
      logicalId: "SiteCertificate",
    });

    // When the hosted zone IDs are read.
    const hostedZoneIds = domainValidationReader.hostedZoneIds([
      { DomainName: "api.example.test", HostedZoneId: "Z00000000000000000001" },
      { DomainName: "www.example.test", HostedZoneId: "Z00000000000000000002" },
    ]);

    // Then each domain maps to its hosted zone.
    assertMapSize(hostedZoneIds, 2);
    assertIdentical(
      hostedZoneIds.get("api.example.test"),
      "Z00000000000000000001",
    );
    assertIdentical(
      hostedZoneIds.get("www.example.test"),
      "Z00000000000000000002",
    );
  });

  it("leaves out entries naming no hosted zone", () => {
    // Given DomainValidationOptions with no HostedZoneId, as a template that
    // validates its certificate outside CloudFormation would have.
    const domainValidationReader = new SimCfnAcmDomainValidationReader({
      logicalId: "SiteCertificate",
    });

    // When the hosted zone IDs are read.
    const hostedZoneIds = domainValidationReader.hostedZoneIds([
      { DomainName: "api.example.test" },
    ]);

    // Then there is nothing for CloudFormation to publish.
    assertMapSize(hostedZoneIds, 0);
  });

  it("rejects a non-string HostedZoneId", () => {
    // Given a DomainValidationOptions item with a non-string HostedZoneId.
    // When the hosted zone IDs are read, then the reader reports the nested
    // invalid property path.
    const error = assertThrowsError(() =>
      reader().hostedZoneIds([
        {
          DomainName: "example.test",
          HostedZoneId: 123,
        },
      ]),
    );

    assertIdentical(
      error.message,
      "Invalid AWS::ACM::Certificate Resource InvalidCertificate property DomainValidationOptions[0].HostedZoneId: must be a string",
    );
  });

  it("rejects DomainValidationOptions when it is not an array", () => {
    // Given a non-array DomainValidationOptions value.
    // When it is read, then the reader reports the invalid property path.
    const error = assertThrowsError(() =>
      reader().options({
        DomainName: "example.test",
      }),
    );

    assertIdentical(
      error.message,
      "Invalid AWS::ACM::Certificate Resource InvalidCertificate property DomainValidationOptions: must be an array",
    );
  });

  it("rejects DomainValidationOptions items that are not objects", () => {
    // Given a DomainValidationOptions array with a non-object item.
    // When it is read, then the reader reports the indexed invalid property
    // path.
    const error = assertThrowsError(() => reader().options(["example.test"]));

    assertIdentical(
      error.message,
      "Invalid AWS::ACM::Certificate Resource InvalidCertificate property DomainValidationOptions[0]: must be an object",
    );
  });

  it("rejects a non-string DomainValidationOptions DomainName", () => {
    // Given a DomainValidationOptions item with a non-string DomainName.
    // When it is read, then the reader reports the nested invalid property
    // path.
    const error = assertThrowsError(() =>
      reader().options([
        {
          DomainName: 123,
        },
      ]),
    );

    assertIdentical(
      error.message,
      "Invalid AWS::ACM::Certificate Resource InvalidCertificate property DomainValidationOptions[0].DomainName: must be a string",
    );
  });

  it("rejects a non-string DomainValidationOptions ValidationDomain", () => {
    // Given a DomainValidationOptions item with a non-string
    // ValidationDomain.
    // When it is read, then the reader reports the nested invalid property
    // path.
    const error = assertThrowsError(() =>
      reader().options([
        {
          ValidationDomain: 123,
        },
      ]),
    );

    assertIdentical(
      error.message,
      "Invalid AWS::ACM::Certificate Resource InvalidCertificate property DomainValidationOptions[0].ValidationDomain: must be a string",
    );
  });

  it("rejects a non-array value when hosted zone IDs are read", () => {
    // Given a non-array DomainValidationOptions value.
    // When hosted zone IDs are read, then the reader reports the invalid
    // property path.
    const error = assertThrowsError(() => reader().hostedZoneIds("example"));

    assertIdentical(
      error.message,
      "Invalid AWS::ACM::Certificate Resource InvalidCertificate property DomainValidationOptions: must be an array",
    );
  });
});

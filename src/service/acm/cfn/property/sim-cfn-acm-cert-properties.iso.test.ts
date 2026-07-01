import { assertIdentical, assertThrowsError } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimCfnAcmCertificatePropertyListReader } from "./sim-cfn-acm-cert-prop-reader.js";
import { SimCfnAcmCertificateProperties } from "./sim-cfn-acm-cert-properties.js";

describe("SimCfnAcmCertificateProperties", () => {
  it("rejects a non-string DomainName", () => {
    // Given ACM certificate properties with an invalid DomainName shape.
    const properties = new SimCfnAcmCertificateProperties({
      logicalId: "InvalidCertificate",
      properties: {
        DomainName: 123,
      },
    });

    // When DomainName is read, then the property reader reports the invalid
    // property path.
    const error = assertThrowsError(() => properties.domainName());

    assertIdentical(
      error.message,
      "Invalid AWS::ACM::Certificate Resource InvalidCertificate property DomainName: must be a string",
    );
  });

  it("rejects an unsupported ValidationMethod", () => {
    // Given ACM certificate properties with a ValidationMethod other than DNS or
    // EMAIL.
    const properties = new SimCfnAcmCertificateProperties({
      logicalId: "InvalidCertificate",
      properties: {
        ValidationMethod: "HTTP",
      },
    });

    // When ValidationMethod is read, then the property reader reports the invalid
    // property path.
    const error = assertThrowsError(() => properties.validationMethod());

    assertIdentical(
      error.message,
      "Invalid AWS::ACM::Certificate Resource InvalidCertificate property ValidationMethod: must be DNS or EMAIL",
    );
  });
});

describe("SimCfnAcmCertificatePropertyListReader", () => {
  it("rejects SubjectAlternativeNames when it is not an array", () => {
    // Given an ACM certificate list-property reader.
    const reader = new SimCfnAcmCertificatePropertyListReader({
      logicalId: "InvalidCertificate",
    });

    // When SubjectAlternativeNames is read from a non-array value, then the
    // reader reports the invalid property path.
    const error = assertThrowsError(() =>
      reader.subjectAlternativeNames("www.example.test"),
    );

    assertIdentical(
      error.message,
      "Invalid AWS::ACM::Certificate Resource InvalidCertificate property SubjectAlternativeNames: must be an array",
    );
  });

  it("rejects SubjectAlternativeNames items that are not strings", () => {
    // Given an ACM certificate SubjectAlternativeNames array with a non-string
    // item.
    const reader = new SimCfnAcmCertificatePropertyListReader({
      logicalId: "InvalidCertificate",
    });

    // When SubjectAlternativeNames is read, then the reader reports the indexed
    // invalid property path.
    const error = assertThrowsError(() =>
      reader.subjectAlternativeNames(["www.example.test", 123]),
    );

    assertIdentical(
      error.message,
      "Invalid AWS::ACM::Certificate Resource InvalidCertificate property SubjectAlternativeNames[1]: must be a string",
    );
  });

  it("rejects DomainValidationOptions when it is not an array", () => {
    // Given an ACM certificate list-property reader.
    const reader = new SimCfnAcmCertificatePropertyListReader({
      logicalId: "InvalidCertificate",
    });

    // When DomainValidationOptions is read from a non-array value, then the
    // reader reports the invalid property path.
    const error = assertThrowsError(() =>
      reader.domainValidationOptions({
        DomainName: "example.test",
      }),
    );

    assertIdentical(
      error.message,
      "Invalid AWS::ACM::Certificate Resource InvalidCertificate property DomainValidationOptions: must be an array",
    );
  });

  it("rejects DomainValidationOptions items that are not objects", () => {
    // Given an ACM certificate DomainValidationOptions array with a non-object
    // item.
    const reader = new SimCfnAcmCertificatePropertyListReader({
      logicalId: "InvalidCertificate",
    });

    // When DomainValidationOptions is read, then the reader reports the indexed
    // invalid property path.
    const error = assertThrowsError(() =>
      reader.domainValidationOptions(["example.test"]),
    );

    assertIdentical(
      error.message,
      "Invalid AWS::ACM::Certificate Resource InvalidCertificate property DomainValidationOptions[0]: must be an object",
    );
  });

  it("rejects a non-string DomainValidationOptions DomainName", () => {
    // Given an ACM certificate DomainValidationOptions item with a non-string
    // DomainName.
    const reader = new SimCfnAcmCertificatePropertyListReader({
      logicalId: "InvalidCertificate",
    });

    // When DomainValidationOptions is read, then the reader reports the nested
    // invalid property path.
    const error = assertThrowsError(() =>
      reader.domainValidationOptions([
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
    // Given an ACM certificate DomainValidationOptions item with a non-string
    // ValidationDomain.
    const reader = new SimCfnAcmCertificatePropertyListReader({
      logicalId: "InvalidCertificate",
    });

    // When DomainValidationOptions is read, then the reader reports the nested
    // invalid property path.
    const error = assertThrowsError(() =>
      reader.domainValidationOptions([
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

  it("rejects Tags when it is not an array", () => {
    // Given an ACM certificate list-property reader.
    const reader = new SimCfnAcmCertificatePropertyListReader({
      logicalId: "InvalidCertificate",
    });

    // When Tags is read from a non-array value, then the reader reports the
    // invalid property path.
    const error = assertThrowsError(() =>
      reader.tags({
        Key: "Purpose",
        Value: "test",
      }),
    );

    assertIdentical(
      error.message,
      "Invalid AWS::ACM::Certificate Resource InvalidCertificate property Tags: must be an array",
    );
  });

  it("rejects Tags items that are not objects", () => {
    // Given an ACM certificate Tags array with a non-object item.
    const reader = new SimCfnAcmCertificatePropertyListReader({
      logicalId: "InvalidCertificate",
    });

    // When Tags is read, then the reader reports the indexed invalid property
    // path.
    const error = assertThrowsError(() => reader.tags(["Purpose"]));

    assertIdentical(
      error.message,
      "Invalid AWS::ACM::Certificate Resource InvalidCertificate property Tags[0]: must be an object",
    );
  });

  it("rejects a non-string Tag Key", () => {
    // Given an ACM certificate Tags item with a non-string Key.
    const reader = new SimCfnAcmCertificatePropertyListReader({
      logicalId: "InvalidCertificate",
    });

    // When Tags is read, then the reader reports the nested invalid property
    // path.
    const error = assertThrowsError(() =>
      reader.tags([
        {
          Key: 123,
        },
      ]),
    );

    assertIdentical(
      error.message,
      "Invalid AWS::ACM::Certificate Resource InvalidCertificate property Tags[0].Key: must be a string",
    );
  });

  it("rejects a non-string Tag Value", () => {
    // Given an ACM certificate Tags item with a non-string Value.
    const reader = new SimCfnAcmCertificatePropertyListReader({
      logicalId: "InvalidCertificate",
    });

    // When Tags is read, then the reader reports the nested invalid property
    // path.
    const error = assertThrowsError(() =>
      reader.tags([
        {
          Value: 123,
        },
      ]),
    );

    assertIdentical(
      error.message,
      "Invalid AWS::ACM::Certificate Resource InvalidCertificate property Tags[0].Value: must be a string",
    );
  });
});

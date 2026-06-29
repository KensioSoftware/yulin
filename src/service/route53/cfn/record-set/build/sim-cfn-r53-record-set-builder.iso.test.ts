import {
  assertIdentical,
  assertInstanceOf,
  assertObjectMatches,
  assertStringIncludes,
  assertThrowsError,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimCfnResource } from "../../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimCfnRoute53RecordSetBuilder } from "./sim-cfn-r53-record-set-builder.js";

describe("SimCfnRoute53RecordSetBuilder", () => {
  function buildRecordSet(properties: SimCfnTemplateValueRecord) {
    return new SimCfnRoute53RecordSetBuilder(
      new SimCfnResource({ logicalId: "TestRecordSet" }),
      properties,
    ).build();
  }

  it("builds a Route53 ResourceRecordSet from CloudFormation properties", () => {
    // Given valid CloudFormation RecordSet properties.
    const recordSet = buildRecordSet({
      Name: "www.example.com",
      Type: "A",
      TTL: "300",
      ResourceRecords: ["192.0.2.1", "192.0.2.2"],
    });

    // Then the values are converted to the simulated Route53 command shape.
    assertObjectMatches(recordSet, {
      Name: "www.example.com",
      Type: "A",
      TTL: 300,
      ResourceRecords: [{ Value: "192.0.2.1" }, { Value: "192.0.2.2" }],
    });
    assertUndefined(recordSet.AliasTarget);
  });

  it("builds a Route53 alias ResourceRecordSet", () => {
    // Given valid CloudFormation alias RecordSet properties.
    const recordSet = buildRecordSet({
      Name: "www.example.com",
      Type: "A",
      AliasTarget: {
        HostedZoneId: "Z2FDTNDATAQYW2",
        DNSName: "d111111abcdef8.cloudfront.net",
        EvaluateTargetHealth: false,
      },
    });

    // Then the AliasTarget is preserved in the simulated Route53 command shape.
    assertObjectMatches(recordSet, {
      Name: "www.example.com",
      Type: "A",
      AliasTarget: {
        HostedZoneId: "Z2FDTNDATAQYW2",
        DNSName: "d111111abcdef8.cloudfront.net",
        EvaluateTargetHealth: false,
      },
    });
    assertUndefined(recordSet.TTL);
    assertUndefined(recordSet.ResourceRecords);
  });

  it("omits optional TTL, ResourceRecords, and AliasTarget when they are not provided", () => {
    // Given only the required RecordSet properties.
    const recordSet = buildRecordSet({
      Name: "example.com",
      Type: "NS",
    });

    // Then optional command fields remain undefined.
    assertObjectMatches(recordSet, {
      Name: "example.com",
      Type: "NS",
    });
    assertUndefined(recordSet.TTL);
    assertUndefined(recordSet.ResourceRecords);
    assertUndefined(recordSet.AliasTarget);
  });

  it("accepts all supported Route53 record types", () => {
    // Given every record type supported by the builder.
    const supportedTypes = ["A", "AAAA", "CNAME", "TXT", "NS", "SOA"] as const;

    for (const type of supportedTypes) {
      // When the RecordSet is built.
      const recordSet = buildRecordSet({
        Name: `${type.toLowerCase()}.example.com`,
        Type: type,
      });

      // Then the type is accepted unchanged.
      assertIdentical(recordSet.Type, type);
    }
  });

  it("throws when Name is not a string", () => {
    // Given a RecordSet with an invalid Name value.
    const error = assertThrowsError(() =>
      buildRecordSet({
        Name: 123,
        Type: "A",
      }),
    );

    // Then a clear validation error is thrown.
    assertInstanceOf(error, TypeError);
    assertStringIncludes(
      error.message,
      "Invalid AWS::Route53::RecordSet TestRecordSet: Name must be a string",
    );
  });

  it("throws when Type is not a supported Route53 record type", () => {
    // Given RecordSets with invalid Type values.
    const invalidTypes = [undefined, "MX", "a", 123, null];

    for (const type of invalidTypes) {
      // When the RecordSet is built.
      const error = assertThrowsError(() =>
        buildRecordSet({
          Name: "www.example.com",
          // @ts-expect-error -- testing invalid type
          Type: type,
        }),
      );

      // Then a clear validation error is thrown.
      assertInstanceOf(error, TypeError);
      assertStringIncludes(
        error.message,
        "Invalid AWS::Route53::RecordSet TestRecordSet: Type must be a supported Route53 record type",
      );
    }
  });

  it("throws when TTL is not a string or number", () => {
    // Given RecordSets with TTL values of unsupported types.
    const invalidTtls = [true, null, {}, []];

    for (const ttl of invalidTtls) {
      // When the RecordSet is built.
      const error = assertThrowsError(() =>
        buildRecordSet({
          Name: "www.example.com",
          Type: "A",
          TTL: ttl,
        }),
      );

      // Then a clear validation error is thrown.
      assertInstanceOf(error, TypeError);
      assertStringIncludes(
        error.message,
        "Invalid AWS::Route53::RecordSet TestRecordSet: TTL must be a string or number",
      );
    }
  });

  it("throws when TTL is not a non-negative integer", () => {
    // Given RecordSets with string or number TTL values that are not valid integers.
    const invalidTtls = [-1, 1.5, "1.5", "foo"];

    for (const ttl of invalidTtls) {
      // When the RecordSet is built.
      const error = assertThrowsError(() =>
        buildRecordSet({
          Name: "www.example.com",
          Type: "A",
          TTL: ttl,
        }),
      );

      // Then a clear validation error is thrown.
      assertInstanceOf(error, TypeError);
      assertStringIncludes(
        error.message,
        "Invalid AWS::Route53::RecordSet TestRecordSet: TTL must be a non-negative integer",
      );
    }
  });

  it("throws when ResourceRecords is not an array", () => {
    // Given RecordSets with ResourceRecords values of unsupported types.
    const invalidResourceRecordsValues = ["192.0.2.1", 123, null, {}];

    for (const resourceRecords of invalidResourceRecordsValues) {
      // When the RecordSet is built.
      const error = assertThrowsError(() =>
        buildRecordSet({
          Name: "www.example.com",
          Type: "A",
          ResourceRecords: resourceRecords,
        }),
      );

      // Then a clear validation error is thrown.
      assertInstanceOf(error, TypeError);
      assertStringIncludes(
        error.message,
        "Invalid AWS::Route53::RecordSet TestRecordSet: ResourceRecords must be an array",
      );
    }
  });

  it("throws when a ResourceRecords value is not a string", () => {
    // Given RecordSets with non-string ResourceRecords entries.
    const invalidResourceRecordValues = [123, false, null, {}];

    for (const value of invalidResourceRecordValues) {
      // When the RecordSet is built.
      const error = assertThrowsError(() =>
        buildRecordSet({
          Name: "www.example.com",
          Type: "A",
          ResourceRecords: [value],
        }),
      );

      // Then a clear validation error is thrown.
      assertInstanceOf(error, TypeError);
      assertStringIncludes(
        error.message,
        "Invalid AWS::Route53::RecordSet TestRecordSet: ResourceRecords values must be strings",
      );
    }
  });
});

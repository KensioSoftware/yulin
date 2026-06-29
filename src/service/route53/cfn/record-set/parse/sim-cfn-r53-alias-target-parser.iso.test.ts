import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimCfnResource } from "../../../../cloudformation/resource/sim-cfn-resource.js";
import { SimCfnRoute53AliasTargetParser } from "./sim-cfn-r53-alias-target-parser.js";

describe("SimCfnRoute53AliasTargetParser", () => {
  function parser(): SimCfnRoute53AliasTargetParser {
    return new SimCfnRoute53AliasTargetParser(
      new SimCfnResource({ logicalId: "TestRecordSet" }),
    );
  }

  it("throws when AliasTarget is not an object", () => {
    // Given invalid AliasTarget values that are not records.
    const invalidAliasTargets = [
      null,
      "d111111abcdef8.cloudfront.net",
      123,
      true,
      [],
    ];

    for (const aliasTarget of invalidAliasTargets) {
      // When AliasTarget is parsed.
      const error = assertThrowsError(() => parser().parse(aliasTarget));

      // Then a clear validation error is thrown.
      assertInstanceOf(error, TypeError);
      assertStringIncludes(
        error.message,
        "Invalid AWS::Route53::RecordSet TestRecordSet: AliasTarget must be an object",
      );
    }
  });

  it("throws when AliasTarget.HostedZoneId is not a string", () => {
    // Given AliasTarget values with invalid HostedZoneId values.
    const invalidHostedZoneIds = [123, true, null, {}];

    for (const hostedZoneId of invalidHostedZoneIds) {
      // When AliasTarget is parsed.
      const error = assertThrowsError(() =>
        parser().parse({
          HostedZoneId: hostedZoneId,
          DNSName: "d111111abcdef8.cloudfront.net",
        }),
      );

      // Then a clear validation error is thrown.
      assertInstanceOf(error, TypeError);
      assertStringIncludes(
        error.message,
        "Invalid AWS::Route53::RecordSet TestRecordSet: AliasTarget.HostedZoneId must be a string",
      );
    }
  });

  it("throws when AliasTarget.DNSName is not a string", () => {
    // Given AliasTarget values with invalid DNSName values.
    const invalidDnsNames = [undefined, 123, true, null, {}];

    for (const dnsName of invalidDnsNames) {
      // When AliasTarget is parsed.
      const error = assertThrowsError(() =>
        parser().parse({
          HostedZoneId: "Z2FDTNDATAQYW2",
          DNSName: dnsName,
        }),
      );

      // Then a clear validation error is thrown.
      assertInstanceOf(error, TypeError);
      assertStringIncludes(
        error.message,
        "Invalid AWS::Route53::RecordSet TestRecordSet: AliasTarget.DNSName must be a string",
      );
    }
  });

  it("throws when AliasTarget.EvaluateTargetHealth is not a boolean", () => {
    // Given AliasTarget values with invalid EvaluateTargetHealth values.
    const invalidEvaluateTargetHealthValues = ["false", 0, null, {}];

    for (const evaluateTargetHealth of invalidEvaluateTargetHealthValues) {
      // When AliasTarget is parsed.
      const error = assertThrowsError(() =>
        parser().parse({
          HostedZoneId: "Z2FDTNDATAQYW2",
          DNSName: "d111111abcdef8.cloudfront.net",
          EvaluateTargetHealth: evaluateTargetHealth,
        }),
      );

      // Then a clear validation error is thrown.
      assertInstanceOf(error, TypeError);
      assertStringIncludes(
        error.message,
        "Invalid AWS::Route53::RecordSet TestRecordSet: AliasTarget.EvaluateTargetHealth must be a boolean",
      );
    }
  });
});

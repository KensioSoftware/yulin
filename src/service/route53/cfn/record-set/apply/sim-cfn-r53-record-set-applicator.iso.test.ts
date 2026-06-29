import {
  assertInstanceOf,
  assertObjectMatches,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../../aws/sim-aws.js";
import { SimCfnResource } from "../../../../cloudformation/resource/sim-cfn-resource.js";
import { SimCfnRoute53RecordSetApplicator } from "./sim-cfn-r53-record-set-applicator.js";

describe("SimCfnRoute53RecordSetApplicator", () => {
  function resource(): SimCfnResource {
    return new SimCfnResource({ logicalId: "TestRecordSet" });
  }

  it("creates a RecordSet by HostedZoneName", async () => {
    // Given a simulated Route53 Hosted Zone.
    const simAws = new SimAws();
    const route53 = simAws.route53();

    await route53.createHostedZone({
      input: {
        Name: "example.com",
        CallerReference: "record-set-by-name-test",
      },
    });
    await simAws.backgroundTasksComplete();

    const applicator = new SimCfnRoute53RecordSetApplicator({ route53 });

    // When a CloudFormation RecordSet is created using HostedZoneName.
    const record = await applicator.create(resource(), {
      HostedZoneName: "example.com",
      Name: "www.example.com",
      Type: "A",
      TTL: 300,
      ResourceRecords: ["192.0.2.1"],
    });

    // Then the record is created in the matching Hosted Zone.
    assertObjectMatches(record, {
      name: "www.example.com",
      type: "A",
      ttl: 300,
      values: ["192.0.2.1"],
    });
  });

  it("throws when HostedZoneId is not a string", async () => {
    // Given a RecordSet applicator.
    const simAws = new SimAws();
    const applicator = new SimCfnRoute53RecordSetApplicator({
      route53: simAws.route53(),
    });

    // When a CloudFormation RecordSet has an invalid HostedZoneId.
    const error = await assertThrowsErrorAsync(async () =>
      applicator.create(resource(), {
        HostedZoneId: 123,
        Name: "www.example.com",
        Type: "A",
        ResourceRecords: ["192.0.2.1"],
      }),
    );

    // Then a clear validation error is thrown.
    assertInstanceOf(error, TypeError);
    assertStringIncludes(
      error.message,
      "Invalid AWS::Route53::RecordSet TestRecordSet: HostedZoneId must be a string",
    );
  });

  it("throws when HostedZoneName is invalid or cannot be found", async () => {
    // Given a RecordSet applicator.
    const simAws = new SimAws();
    const applicator = new SimCfnRoute53RecordSetApplicator({
      route53: simAws.route53(),
    });

    const invalidHostedZoneNameError = await assertThrowsErrorAsync(async () =>
      applicator.create(resource(), {
        HostedZoneName: 123,
        Name: "www.example.com",
        Type: "A",
        ResourceRecords: ["192.0.2.1"],
      }),
    );

    assertInstanceOf(invalidHostedZoneNameError, TypeError);
    assertStringIncludes(
      invalidHostedZoneNameError.message,
      "Invalid AWS::Route53::RecordSet TestRecordSet: HostedZoneId or HostedZoneName must be a string",
    );

    // When a CloudFormation RecordSet references a missing HostedZoneName.
    const missingHostedZoneNameError = await assertThrowsErrorAsync(async () =>
      applicator.create(resource(), {
        HostedZoneName: "missing.example.com",
        Name: "www.missing.example.com",
        Type: "A",
        ResourceRecords: ["192.0.2.1"],
      }),
    );

    // Then a clear not found error is thrown.
    assertStringIncludes(
      missingHostedZoneNameError.message,
      "Invalid AWS::Route53::RecordSet TestRecordSet: HostedZoneName missing.example.com was not found",
    );
  });
});

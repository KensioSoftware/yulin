import { ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  assertArrayLength,
  assertIdentical,
  assertObjectEquals,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimFixedClock } from "../../../../../util/clock/sim-clock.js";
import { SimAws } from "../../../../aws/sim-aws.js";
import type { SimCfnTemplateValue } from "../../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimS3LifecycleRule } from "../../../command/put-bucket-lifecycle-configuration/put-bucket-lifecycle-configuration.command.js";

/**
 * Deploy a report Bucket declaring one lifecycle rule, and answer the rules it
 * reads back.
 */
async function deployedRules(
  simAws: SimAws,
  rule: SimCfnTemplateValue,
): Promise<readonly SimS3LifecycleRule[]> {
  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "reports-stack",
    template: {
      Resources: {
        ReportBucket: {
          Type: "AWS::S3::Bucket",
          Properties: {
            BucketName: "reports",
            LifecycleConfiguration: { Rules: [rule] },
          },
        },
      },
    },
  });
  await stack.waitForDeployComplete();

  const output = await simAws.s3().getBucketLifecycleConfiguration({
    input: { Bucket: "reports" },
  });

  return output.Rules;
}

/**
 * A template's `TagFilters` on an AWS::S3::Bucket lifecycle rule.
 *
 * CloudFormation states the tags a rule filters on beside its `Prefix`, where
 * the request holds both inside a `Filter`, so a deployed rule reads back in
 * the shape the request takes.
 */
describe("AWS::S3::Bucket lifecycle TagFilters", () => {
  it("gathers a prefix and one tag under an And", async () => {
    // Given a template scoping a rule to a prefix and a tag.
    const simAws = new SimAws();

    // When the Stack is deployed.
    const rules = await deployedRules(simAws, {
      Id: "expire-temporary-reports",
      Status: "Enabled",
      Prefix: "reports/",
      TagFilters: [{ Key: "lifecycle", Value: "temporary" }],
      ExpirationInDays: 7,
    });

    // Then both arrive inside the `And` a rule scoped by more than one
    // condition takes, and the prefix is no longer stated twice.
    assertArrayLength(rules, 1);
    assertObjectEquals(rules[0], {
      Status: "Enabled",
      ID: "expire-temporary-reports",
      Filter: {
        And: {
          Prefix: "reports/",
          Tags: [{ Key: "lifecycle", Value: "temporary" }],
        },
      },
      Expiration: { Days: 7 },
    });
  });

  it("states one tag on its own as a bare Tag", async () => {
    // Given a template scoping a rule to one tag and nothing else.
    const simAws = new SimAws();

    // When the Stack is deployed.
    const rules = await deployedRules(simAws, {
      Id: "expire-temporary",
      Status: "Enabled",
      TagFilters: [{ Key: "lifecycle", Value: "temporary" }],
      ExpirationInDays: 7,
    });

    // Then the tag arrives as the `Filter.Tag` a rule scoped by one condition
    // takes.
    assertArrayLength(rules, 1);
    assertObjectEquals(rules[0], {
      Status: "Enabled",
      ID: "expire-temporary",
      Filter: { Tag: { Key: "lifecycle", Value: "temporary" } },
      Expiration: { Days: 7 },
    });
  });

  it("gathers two tags under an And with no prefix beside them", async () => {
    // Given a template scoping a rule to two tags.
    const simAws = new SimAws();

    // When the Stack is deployed.
    const rules = await deployedRules(simAws, {
      Id: "expire-drafts",
      Status: "Enabled",
      TagFilters: [
        { Key: "lifecycle", Value: "temporary" },
        { Key: "team", Value: "finance" },
      ],
      ExpirationInDays: 7,
    });

    // Then the two arrive under an `And` holding the tags alone.
    assertArrayLength(rules, 1);
    assertObjectEquals(rules[0], {
      Status: "Enabled",
      ID: "expire-drafts",
      Filter: {
        And: {
          Tags: [
            { Key: "lifecycle", Value: "temporary" },
            { Key: "team", Value: "finance" },
          ],
        },
      },
      Expiration: { Days: 7 },
    });
  });

  it("expires the Objects a template's tag filter selects", async () => {
    // Given a Bucket expiring anything tagged as temporary after a week, and
    // one tagged Object beside one that is not.
    const simAws = new SimAws({
      clock: new SimFixedClock(new Date("2026-09-02T09:00:00.000Z")),
    });
    await deployedRules(simAws, {
      Id: "expire-temporary",
      Status: "Enabled",
      TagFilters: [{ Key: "lifecycle", Value: "temporary" }],
      ExpirationInDays: 7,
    });
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "reports",
        Key: "draft.csv",
        Body: "period,total",
        Tagging: "lifecycle=temporary",
      }),
    );
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "reports",
        Key: "final.csv",
        Body: "period,total",
      }),
    );

    // When the clock passes the expiry.
    await simAws.clock().advanceBy({ days: 8 });

    // Then the tagged Object has gone and the untagged one is still there.
    const listing = await simAws
      .s3()
      .listObjectsV2(new ListObjectsV2Command({ Bucket: "reports" }));

    assertArrayLength(listing.Contents ?? [], 1);
    assertIdentical(listing.Contents?.[0]?.Key, "final.csv");
  });
});

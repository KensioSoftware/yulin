import {
  GetBucketLifecycleConfigurationCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimFixedClock } from "../../../../../util/clock/sim-clock.js";
import { SimAws } from "../../../../aws/sim-aws.js";
import type { SimCfnTemplateValue } from "../../../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimS3NoSuchLifecycleConfiguration } from "../../../error/sim-s3.error.js";
import type { SimS3LifecycleRule } from "../../../command/put-bucket-lifecycle-configuration/put-bucket-lifecycle-configuration.command.js";

/**
 * Deploy a log Bucket declaring the given lifecycle rules.
 */
async function deployBucketWithRules(
  simAws: SimAws,
  rules: SimCfnTemplateValue[],
): Promise<void> {
  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "logs-stack",
    template: {
      Resources: {
        LogBucket: {
          Type: "AWS::S3::Bucket",
          Properties: {
            BucketName: "logs",
            LifecycleConfiguration: { Rules: rules },
          },
        },
      },
    },
  });
  await stack.waitForDeployComplete();
}

/**
 * The rules a deployed log Bucket reads back.
 */
async function readRules(
  simAws: SimAws,
): Promise<readonly SimS3LifecycleRule[]> {
  const output = await simAws
    .s3()
    .getBucketLifecycleConfiguration(
      new GetBucketLifecycleConfigurationCommand({ Bucket: "logs" }),
    );

  return output.Rules;
}

describe("AWS::S3::Bucket LifecycleConfiguration", () => {
  it("reads a template's expiry rule back off the deployed Bucket", async () => {
    // Given a template expiring raw logs after a year, as CDK synthesizes an
    // expiration from a Duration.
    const simAws = new SimAws();

    // When the Stack is deployed.
    await deployBucketWithRules(simAws, [
      {
        Id: "expire-raw-logs",
        Status: "Enabled",
        Prefix: "raw/",
        ExpirationInDays: 365,
      },
    ]);

    // Then the rule reads back in the shape the SDK states one in, with the
    // id renamed and the expiry gathered under the field the request carries.
    const rules = await readRules(simAws);

    assertArrayLength(rules, 1);
    assertObjectEquals(rules[0], {
      Status: "Enabled",
      Prefix: "raw/",
      ID: "expire-raw-logs",
      Expiration: { Days: 365 },
    });
  });

  it("gathers an expiry date and a delete marker under one field", async () => {
    // Given a template stating an expiry as a date.
    const simAws = new SimAws();

    // When the Stack is deployed.
    await deployBucketWithRules(simAws, [
      {
        Id: "expire-on-a-date",
        Status: "Enabled",
        ExpirationDate: "2027-01-01T00:00:00Z",
        ExpiredObjectDeleteMarker: false,
      },
    ]);

    // Then the date arrives as a Date, because that is what the SDK hands a
    // caller reading the configuration back.
    const rules = await readRules(simAws);

    assertArrayLength(rules, 1);
    assertNonNullable(rules[0]);
    const expiration = rules[0].Expiration;
    assertNonNullable(expiration);
    assertInstanceOf(expiration.Date, Date);
    assertIdentical(expiration.Date.toISOString(), "2027-01-01T00:00:00.000Z");
    assertFalse(expiration.ExpiredObjectDeleteMarker);
  });

  it("renames a transition's timing and takes the singular form too", async () => {
    // Given a template stating one transition in the list and one on its own,
    // both of which CloudFormation accepts.
    const simAws = new SimAws();

    // When the Stack is deployed.
    await deployBucketWithRules(simAws, [
      {
        Id: "tier-down",
        Status: "Enabled",
        Transitions: [{ StorageClass: "GLACIER", TransitionInDays: 90 }],
        Transition: { StorageClass: "DEEP_ARCHIVE", TransitionInDays: 400 },
      },
    ]);

    // Then both are read as transitions, each timed by the field the request
    // names rather than the one the template does.
    const rules = await readRules(simAws);

    assertArrayLength(rules, 1);
    assertNonNullable(rules[0]);
    const transitions = rules[0].Transitions;
    assertNonNullable(transitions);
    assertArrayLength(transitions, 2);
    assertObjectEquals(transitions[0], {
      StorageClass: "GLACIER",
      Days: 90,
    });
    assertObjectEquals(transitions[1], {
      StorageClass: "DEEP_ARCHIVE",
      Days: 400,
    });
  });

  it("carries a rule field it has no translation for across unchanged", async () => {
    // Given a template bounding a rule by object size, which CloudFormation
    // and the request spell the same way.
    const simAws = new SimAws();

    // When the Stack is deployed.
    await deployBucketWithRules(simAws, [
      {
        Id: "big-objects",
        Status: "Enabled",
        ExpirationInDays: 30,
        ObjectSizeGreaterThan: 1024,
        ObjectSizeLessThan: 1_048_576,
      },
    ]);

    // Then both arrive as the template stated them. Dropping either would read
    // back as a Bucket configured with less than the template asked for.
    const rules = await readRules(simAws);

    assertArrayLength(rules, 1);
    assertObjectEquals(rules[0], {
      ID: "big-objects",
      Status: "Enabled",
      Expiration: { Days: 30 },
      ObjectSizeGreaterThan: 1024,
      ObjectSizeLessThan: 1_048_576,
    });
  });

  it("records nothing against a Resource whose rules are acted on", async () => {
    // Given a template expiring raw logs after a year.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "logs-stack",
      template: {
        Resources: {
          LogBucket: {
            Type: "AWS::S3::Bucket",
            Properties: {
              BucketName: "logs",
              LifecycleConfiguration: {
                Rules: [
                  { Id: "expire", Status: "Enabled", ExpirationInDays: 365 },
                ],
              },
            },
          },
        },
      },
    });

    // When the Stack has settled.
    await stack.waitForDeployComplete();

    // Then nothing is recorded against the Resource. The Bucket expires an
    // Object once the clock passes the rule, so the deployed rules are the
    // behaviour the template asked for.
    assertArrayEmpty(stack.ignoredProperties);
  });

  it("expires an Object against the rule the template declared", async () => {
    // Given a deployed Bucket expiring raw logs after a year, holding one.
    const simAws = new SimAws({
      clock: new SimFixedClock(new Date("2026-08-24T09:00:00.000Z")),
    });
    await deployBucketWithRules(simAws, [
      {
        Id: "expire",
        Status: "Enabled",
        Prefix: "raw/",
        ExpirationInDays: 365,
      },
    ]);
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "logs",
        Key: "raw/2026-08-24.gz",
        Body: "one raw log line",
      }),
    );

    // When simulated time moves past the year.
    await simAws.clock().advanceBy({ days: 366 });

    // Then the Object has gone. The template asked for retention, and this is
    // the retention rather than a record of the request for it.
    const listing = await simAws
      .s3()
      .listObjectsV2(new ListObjectsV2Command({ Bucket: "logs" }));
    assertArrayEmpty(listing.Contents ?? []);
  });

  it("leaves a Bucket declaring no rules unconfigured", async () => {
    // Given a template declaring a Bucket and nothing about its lifecycle.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "plain-stack",
      template: {
        Resources: {
          LogBucket: {
            Type: "AWS::S3::Bucket",
            Properties: { BucketName: "logs" },
          },
        },
      },
    });

    // When the Stack has settled.
    await stack.waitForDeployComplete();

    // Then reading its configuration says there is none, and nothing was
    // recorded against the Resource either.
    const error = await assertThrowsErrorAsync(async () => readRules(simAws));

    assertInstanceOf(error, SimS3NoSuchLifecycleConfiguration);
    assertArrayEmpty(stack.ignoredProperties);
  });

  it("fails the Resource over a configuration in the wrong shape", async () => {
    // Given a template stating the rules as a string.
    const simAws = new SimAws();

    // When the Stack is deployed.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "broken-stack",
        template: {
          Resources: {
            LogBucket: {
              Type: "AWS::S3::Bucket",
              Properties: {
                BucketName: "logs",
                LifecycleConfiguration: { Rules: "expire-everything" },
              },
            },
          },
        },
      });
    });

    // Then the Stack fails rather than deploying a Bucket whose rules a test
    // then finds missing, and the refusal names the level that was wrong. The
    // Bucket itself is created before its configurations are applied, so it is
    // left behind carrying none of them.
    assertStringIncludes(error.message, "LifecycleConfiguration Rules");
    assertStringIncludes(error.message, "must be a list");

    const readError = await assertThrowsErrorAsync(async () =>
      readRules(simAws),
    );
    assertInstanceOf(readError, SimS3NoSuchLifecycleConfiguration);
  });
});

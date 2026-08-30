import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../../aws/sim-aws.js";
import type { SimCfnDeployedStack } from "../../../../cloudformation/stack/sim-cfn-deployed-stack.type.js";
import type { SimCfnTemplateValueRecord } from "../../../../cloudformation/template/value/sim-cfn-template-value.js";

const replicationRole = "arn:aws:iam::111111111111:role/replication";
const replicaBucketArn = "arn:aws:s3:::recordings-replica";

/**
 * A Bucket template carrying versioning and the given replication
 * configuration, which is what a replicated Bucket looks like.
 */
function bucketProperties(
  replication: SimCfnTemplateValueRecord,
): SimCfnTemplateValueRecord {
  return {
    BucketName: "recordings",
    VersioningConfiguration: { Status: "Enabled" },
    ReplicationConfiguration: replication,
  };
}

/**
 * One replication rule with the fields the V2 schema requires, so a test can
 * change the one field it is about.
 */
function replicationRule(
  fields: SimCfnTemplateValueRecord,
): SimCfnTemplateValueRecord {
  return {
    Status: "Enabled",
    Priority: 1,
    Filter: { Prefix: "recordings/" },
    DeleteMarkerReplication: { Status: "Enabled" },
    Destination: { Bucket: replicaBucketArn },
    ...fields,
  };
}

async function deployBucket(
  properties: SimCfnTemplateValueRecord,
): Promise<SimCfnDeployedStack> {
  const stack = await new SimAws().cloudFormation().deployTemplate({
    stackName: "recordings-stack",
    template: {
      Resources: {
        SiteBucket: { Type: "AWS::S3::Bucket", Properties: properties },
      },
    },
  });
  await stack.waitForDeployComplete();

  return stack;
}

async function deployFailing(
  properties: SimCfnTemplateValueRecord,
): Promise<Error> {
  return await assertThrowsErrorAsync(async () => {
    await deployBucket(properties);
  });
}

describe("AWS::S3::Bucket ReplicationConfiguration rules", () => {
  it("deploys a Bucket without the replication its template asked for", async () => {
    // Given a template asking for a replication rule real S3 accepts.
    // When the template is deployed.
    const stack = await deployBucket(
      bucketProperties({
        Role: replicationRole,
        Rules: [replicationRule({})],
      }),
    );

    // Then the Bucket is created, replicating nothing, and both properties it
    // was created without are recorded against the Resource.
    assertTrue(stack.getResource("SiteBucket")?.deployed);
    assertArrayLength(stack.ignoredProperties, 2);
    assertIdentical(
      stack.ignoredProperties.map((entry) => entry.path).join(", "),
      "VersioningConfiguration, ReplicationConfiguration",
    );
  });

  it("refuses a metrics event threshold with no Replication Time Control", async () => {
    // Given a rule asking for replication metrics through CDK's `metrics`
    // property, which renders an EventThreshold on its own. Real S3 answers
    // that with a 400 and CloudFormation rolls the stack back.
    // When the template is deployed.
    const error = await deployFailing(
      bucketProperties({
        Role: replicationRole,
        Rules: [
          replicationRule({
            Destination: {
              Bucket: replicaBucketArn,
              Metrics: { Status: "Enabled", EventThreshold: { Minutes: 15 } },
            },
          }),
        ],
      }),
    );

    // Then the Stack fails here too, in the words S3 refuses it with.
    assertStringIncludes(
      error.message,
      "Invalid AWS::S3::Bucket Resource SiteBucket: ReplicationConfiguration " +
        "Rules[0] Destination Metrics cannot contain an event threshold when " +
        "ReplicationTime is not specified or Disabled",
    );
  });

  it("deploys replication metrics alongside Replication Time Control", async () => {
    // Given the same threshold on a rule that turns RTC on, which is the
    // configuration the threshold is measured against.
    // When the template is deployed.
    const stack = await deployBucket(
      bucketProperties({
        Role: replicationRole,
        Rules: [
          replicationRule({
            Destination: {
              Bucket: replicaBucketArn,
              ReplicationTime: { Status: "Enabled", Time: { Minutes: 15 } },
              Metrics: { Status: "Enabled", EventThreshold: { Minutes: 15 } },
            },
          }),
        ],
      }),
    );

    // Then the Bucket deploys, with replication recorded as unsimulated.
    assertTrue(stack.getResource("SiteBucket")?.deployed);
  });

  it("deploys metrics with no event threshold at all", async () => {
    // Given the shape S3 documents for replication metrics without RTC, which
    // is the status on its own.
    // When the template is deployed.
    const stack = await deployBucket(
      bucketProperties({
        Role: replicationRole,
        Rules: [
          replicationRule({
            Destination: {
              Bucket: replicaBucketArn,
              Metrics: { Status: "Enabled" },
            },
          }),
        ],
      }),
    );

    // Then the Bucket deploys.
    assertTrue(stack.getResource("SiteBucket")?.deployed);
  });

  it("refuses a rule that filters without the fields a filter requires", async () => {
    // Given a rule stating a Filter and neither the Priority nor the delete
    // marker setting S3 requires alongside one.
    // When the template is deployed.
    const error = await deployFailing(
      bucketProperties({
        Role: replicationRole,
        Rules: [
          {
            Status: "Enabled",
            Filter: { Prefix: "recordings/" },
            Destination: { Bucket: replicaBucketArn },
          },
        ],
      }),
    );

    // Then the Stack fails naming both fields that were missing.
    assertStringIncludes(
      error.message,
      "ReplicationConfiguration Rules[0] states a Filter, which requires " +
        "DeleteMarkerReplication, Priority as well",
    );
  });

  it("deploys an older rule that selects objects by Prefix", async () => {
    // Given a V1 rule, which carries a Prefix instead of a Filter and needs
    // none of the fields a Filter requires.
    // When the template is deployed.
    const stack = await deployBucket(
      bucketProperties({
        Role: replicationRole,
        Rules: [
          {
            Status: "Enabled",
            Prefix: "recordings/",
            Destination: { Bucket: replicaBucketArn },
          },
        ],
      }),
    );

    // Then the Bucket deploys.
    assertTrue(stack.getResource("SiteBucket")?.deployed);
  });

  it("refuses replication on a Bucket that keeps one version of an Object", async () => {
    // Given a replicated Bucket whose template never enabled versioning.
    // When the template is deployed.
    const error = await deployFailing({
      BucketName: "recordings",
      ReplicationConfiguration: {
        Role: replicationRole,
        Rules: [replicationRule({})],
      },
    });

    // Then the Stack fails, as real S3 refuses replication on an unversioned
    // Bucket.
    assertStringIncludes(
      error.message,
      "Versioning must be Enabled on the Bucket to apply a " +
        "ReplicationConfiguration",
    );
  });

  it("refuses replication on a Bucket whose versioning was suspended", async () => {
    // Given a template that states versioning and turns it off, which is a
    // Bucket that keeps one version of an Object as surely as one that never
    // stated versioning at all.
    // When the template is deployed.
    const error = await deployFailing({
      BucketName: "recordings",
      VersioningConfiguration: { Status: "Suspended" },
      ReplicationConfiguration: {
        Role: replicationRole,
        Rules: [replicationRule({})],
      },
    });

    // Then the Stack fails.
    assertStringIncludes(error.message, "Versioning must be Enabled");
  });

  it("deploys a Bucket whose ReplicationConfiguration is not an object", async () => {
    // Given a misshapen configuration, which is a template error this rule has
    // no opinion about.
    // When the template is deployed.
    const stack = await deployBucket({
      BucketName: "recordings",
      ReplicationConfiguration: "replicate-everything",
    });

    // Then the Bucket is still created and the property is recorded, as it was
    // before any of this validated anything.
    assertArrayLength(stack.ignoredProperties, 1);
    const ignored = stack.ignoredProperties[0];
    assertNonNullable(ignored);
    assertStringIncludes(ignored.reason, "Bucket replication is not simulated");
  });
});

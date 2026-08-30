import {
  DeleteObjectCommand,
  GetObjectLockConfigurationCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../../aws/sim-aws.js";
import type { SimCfnDeployedStack } from "../../../../cloudformation/stack/sim-cfn-deployed-stack.type.js";
import type { SimCfnTemplateValueRecord } from "../../../../cloudformation/template/value/sim-cfn-template-value.js";

const bucketName = "reader-history";
const key = "events/reader-1.json";

/**
 * Deploy a history Bucket declaring the given Object Lock properties.
 */
async function deployBucket(
  simAws: SimAws,
  properties: SimCfnTemplateValueRecord,
): Promise<SimCfnDeployedStack> {
  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "history-stack",
    template: {
      Resources: {
        HistoryBucket: {
          Type: "AWS::S3::Bucket",
          Properties: { BucketName: bucketName, ...properties },
        },
      },
    },
  });
  await stack.waitForDeployComplete();

  return stack;
}

const versionedAndLocked: SimCfnTemplateValueRecord = {
  VersioningConfiguration: { Status: "Enabled" },
  ObjectLockEnabled: true,
};

describe("AWS::S3::Bucket Object Lock", () => {
  it("answers with the configuration the template declared", async () => {
    // Given a template declaring a locked Bucket with a default retention,
    // which is what CDK synthesises for objectLockDefaultRetention.
    const simAws = new SimAws();
    const stack = await deployBucket(simAws, {
      ...versionedAndLocked,
      ObjectLockConfiguration: {
        ObjectLockEnabled: "Enabled",
        Rule: { DefaultRetention: { Mode: "COMPLIANCE", Days: 7 } },
      },
    });

    // When the Bucket is read back through the SDK.
    const read = await simAws
      .s3()
      .getObjectLockConfiguration(
        new GetObjectLockConfigurationCommand({ Bucket: bucketName }),
      );

    // Then it answers with what the template declared.
    assertIdentical(read.ObjectLockConfiguration.ObjectLockEnabled, "Enabled");

    const defaults = read.ObjectLockConfiguration.Rule?.DefaultRetention;
    assertNonNullable(defaults);
    assertIdentical(defaults.Mode, "COMPLIANCE");
    assertIdentical(defaults.Days, 7);

    // And neither property is recorded as one the Bucket was created without.
    assertUndefined(
      stack.ignoredProperties.find((ignored) =>
        ignored.path.startsWith("ObjectLock"),
      ),
    );
  });

  it("locks a Bucket declaring ObjectLockEnabled and no configuration", async () => {
    // Given a template turning Object Lock on and declaring no default
    // retention, which locks nothing on its own.
    const simAws = new SimAws();
    await deployBucket(simAws, versionedAndLocked);

    // When the configuration is read back.
    const read = await simAws
      .s3()
      .getObjectLockConfiguration(
        new GetObjectLockConfigurationCommand({ Bucket: bucketName }),
      );

    // Then Object Lock is on, with no rule under it.
    assertIdentical(read.ObjectLockConfiguration.ObjectLockEnabled, "Enabled");
    assertUndefined(read.ObjectLockConfiguration.Rule);
  });

  it("refuses a locked Bucket the template leaves unversioned", async () => {
    // Given a template turning Object Lock on and no versioning under it.
    // When it is deployed, then the Resource fails, in the words an SDK caller
    // is refused in. A Bucket created around the property would report a
    // retention nothing was enforcing.
    const error = await assertThrowsErrorAsync(async () => {
      return await deployBucket(new SimAws(), { ObjectLockEnabled: true });
    });

    assertStringIncludes(error.message, "does not have versioning enabled");
  });

  it("refuses a configuration the template does not enable", async () => {
    // Given a template declaring a default retention without turning Object
    // Lock on, which real CloudFormation refuses too.
    const error = await assertThrowsErrorAsync(async () => {
      return await deployBucket(new SimAws(), {
        VersioningConfiguration: { Status: "Enabled" },
        ObjectLockConfiguration: {
          ObjectLockEnabled: "Enabled",
          Rule: { DefaultRetention: { Mode: "GOVERNANCE", Days: 1 } },
        },
      });
    });

    assertStringIncludes(
      error.message,
      "ObjectLockConfiguration requires ObjectLockEnabled to be true",
    );
  });

  it("retains a version written into a Bucket the template locked", async () => {
    // Given a deployed Bucket retaining every version for a year.
    const simAws = new SimAws();
    await deployBucket(simAws, {
      ...versionedAndLocked,
      ObjectLockConfiguration: {
        ObjectLockEnabled: "Enabled",
        Rule: { DefaultRetention: { Mode: "COMPLIANCE", Years: 1 } },
      },
    });
    const s3 = simAws.s3();

    // When a reader's history is appended to.
    const put = await s3.putObject(
      new PutObjectCommand({ Bucket: bucketName, Key: key, Body: "one" }),
    );
    assertNonNullable(put.VersionId);

    // Then the version reports the retention, counted from the write.
    const head = await s3.headObject(
      new HeadObjectCommand({
        Bucket: bucketName,
        Key: key,
        VersionId: put.VersionId,
      }),
    );
    assertIdentical(head.ObjectLockMode, "COMPLIANCE");

    // And nothing in the account can delete it.
    const error = await assertThrowsErrorAsync(async () => {
      return await s3.deleteObject(
        new DeleteObjectCommand({
          Bucket: bucketName,
          Key: key,
          VersionId: put.VersionId,
          BypassGovernanceRetention: true,
        }),
      );
    });

    assertIdentical(error.name, "AccessDenied");
  });

  it("refuses an ObjectLockEnabled that is neither true nor false", async () => {
    // Given a template carrying something else as ObjectLockEnabled, which
    // real CloudFormation refuses as well.
    // When it is deployed, then it is refused rather than read as false,
    // because the Bucket it asked for is not knowable.
    const error = await assertThrowsErrorAsync(async () => {
      return await deployBucket(new SimAws(), { ObjectLockEnabled: "yes" });
    });

    assertStringIncludes(
      error.message,
      "ObjectLockEnabled must be true or false",
    );
  });

  it("refuses an ObjectLockConfiguration that is not an object", async () => {
    // Given a configuration declared as a string.
    const error = await assertThrowsErrorAsync(async () => {
      return await deployBucket(new SimAws(), {
        ...versionedAndLocked,
        ObjectLockConfiguration: "COMPLIANCE",
      });
    });

    assertStringIncludes(
      error.message,
      "ObjectLockConfiguration must be an object",
    );
  });

  it("refuses a configuration on a Bucket that says Object Lock is off", async () => {
    // Given a template carrying a default retention and ObjectLockEnabled
    // false, which is the two properties disagreeing about the same thing.
    const error = await assertThrowsErrorAsync(async () => {
      return await deployBucket(new SimAws(), {
        VersioningConfiguration: { Status: "Enabled" },
        ObjectLockEnabled: false,
        ObjectLockConfiguration: {
          ObjectLockEnabled: "Enabled",
          Rule: { DefaultRetention: { Mode: "GOVERNANCE", Days: 1 } },
        },
      });
    });

    assertStringIncludes(
      error.message,
      "ObjectLockConfiguration requires ObjectLockEnabled to be true",
    );
  });

  it("leaves a Bucket declaring ObjectLockEnabled false unlocked", async () => {
    // Given a template saying Object Lock is off, which is what CDK
    // synthesises for a Bucket that never asked for it.
    const simAws = new SimAws();
    await deployBucket(simAws, {
      VersioningConfiguration: { Status: "Enabled" },
      ObjectLockEnabled: false,
    });

    // When the configuration is read, then there is none, as real S3 answers
    // a Bucket that has never had one.
    const error = await assertThrowsErrorAsync(async () => {
      return await simAws
        .s3()
        .getObjectLockConfiguration(
          new GetObjectLockConfigurationCommand({ Bucket: bucketName }),
        );
    });

    assertIdentical(error.name, "ObjectLockConfigurationNotFoundError");
  });
});

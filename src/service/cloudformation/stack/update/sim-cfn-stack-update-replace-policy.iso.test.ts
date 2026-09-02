import { buffer } from "node:stream/consumers";
import { describe, it } from "vitest";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import {
  CreateStackCommand,
  UpdateStackCommand,
} from "@aws-sdk/client-cloudformation";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { SimAws } from "../../../aws/sim-aws.js";
import { jsonStringify } from "../../../../util/type-guard/json.js";

describe("simulated CloudFormation UpdateReplacePolicy", () => {
  /**
   * A Stack of one Bucket, declared with whatever policy attributes the case
   * under test needs and named so the update can move it.
   */
  function bucketTemplate(properties: {
    readonly attributes: Record<string, string>;
    readonly bucketName: string;
  }): string {
    return jsonStringify({
      Resources: {
        ReportsBucket: {
          Type: "AWS::S3::Bucket",
          ...properties.attributes,
          Properties: { BucketName: properties.bucketName },
        },
      },
    });
  }

  it("keeps a replaced Resource its UpdateReplacePolicy retains", async () => {
    // Given a deployed Bucket holding an Object, marked with
    // UpdateReplacePolicy Retain the way CDK marks one.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await cloudFormation.createStack(
      new CreateStackCommand({
        StackName: "reports-stack",
        TemplateBody: bucketTemplate({
          attributes: { UpdateReplacePolicy: "Retain" },
          bucketName: "reports-first",
        }),
      }),
    );
    await cloudFormation.waitForStackDeployComplete("reports-stack");
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "reports-first",
        Key: "january.csv",
        Body: "reported",
      }),
    );

    // When an update renames the Bucket, which replaces it.
    await cloudFormation.updateStack(
      new UpdateStackCommand({
        StackName: "reports-stack",
        TemplateBody: bucketTemplate({
          attributes: { UpdateReplacePolicy: "Retain" },
          bucketName: "reports-second",
        }),
      }),
    );
    await cloudFormation.waitForStackUpdateComplete("reports-stack");

    // Then the deployed Bucket is still in simulated S3 with what it held.
    const kept = await simAws
      .s3()
      .getObject(
        new GetObjectCommand({ Bucket: "reports-first", Key: "january.csv" }),
      );
    assertNonNullable(kept.Body);

    const keptBytes = await buffer(kept.Body);

    assertIdentical(keptBytes.toString(), "reported");

    // And the replacement was created beside it.
    assertNonNullable(simAws.s3().getSimBucketByName("reports-second"));

    // And the Stack reports the Bucket it kept, having stopped tracking it:
    // the logical ID now answers for the replacement.
    const stack = cloudFormation.getStackByName("reports-stack");
    assertNonNullable(stack);
    assertIdentical(stack.status, "UPDATE_COMPLETE");
    assertArrayLength(stack.retainedResources, 1);
    assertIdentical(stack.retainedResources[0].status, "DELETE_SKIPPED");
    assertIdentical(
      stack.getResource("ReportsBucket")?.status,
      "CREATE_COMPLETE",
    );
  });

  it("deletes a replaced Resource whose UpdateReplacePolicy is Delete", async () => {
    // Given a deployed Bucket that says to delete the replaced instance.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await cloudFormation.createStack(
      new CreateStackCommand({
        StackName: "archive-stack",
        TemplateBody: bucketTemplate({
          attributes: { UpdateReplacePolicy: "Delete" },
          bucketName: "archive-first",
        }),
      }),
    );
    await cloudFormation.waitForStackDeployComplete("archive-stack");

    // When an update replaces it.
    await cloudFormation.updateStack(
      new UpdateStackCommand({
        StackName: "archive-stack",
        TemplateBody: bucketTemplate({
          attributes: { UpdateReplacePolicy: "Delete" },
          bucketName: "archive-second",
        }),
      }),
    );
    await cloudFormation.waitForStackUpdateComplete("archive-stack");

    // Then the deployed Bucket has gone and nothing is reported as kept.
    assertUndefined(simAws.s3().getSimBucketByName("archive-first"));
    assertNonNullable(simAws.s3().getSimBucketByName("archive-second"));

    const stack = cloudFormation.getStackByName("archive-stack");
    assertNonNullable(stack);
    assertArrayEmpty(stack.retainedResources);
  });

  it("deletes a replaced Resource with no UpdateReplacePolicy", async () => {
    // Given a deployed Bucket carrying no policy attributes at all.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await cloudFormation.createStack(
      new CreateStackCommand({
        StackName: "plain-stack",
        TemplateBody: bucketTemplate({
          attributes: {},
          bucketName: "plain-first",
        }),
      }),
    );
    await cloudFormation.waitForStackDeployComplete("plain-stack");

    // When an update replaces it.
    await cloudFormation.updateStack(
      new UpdateStackCommand({
        StackName: "plain-stack",
        TemplateBody: bucketTemplate({
          attributes: {},
          bucketName: "plain-second",
        }),
      }),
    );
    await cloudFormation.waitForStackUpdateComplete("plain-stack");

    // Then the deployed Bucket has gone, as it did before the policy was read.
    assertUndefined(simAws.s3().getSimBucketByName("plain-first"));
    assertNonNullable(simAws.s3().getSimBucketByName("plain-second"));
  });

  it("deletes a replaced Resource whose UpdateReplacePolicy is Snapshot", async () => {
    // Given a deployed Bucket asking for a snapshot no simulated service can
    // take, which leaves nothing to keep the Bucket for.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await cloudFormation.createStack(
      new CreateStackCommand({
        StackName: "snapshot-stack",
        TemplateBody: bucketTemplate({
          attributes: { UpdateReplacePolicy: "Snapshot" },
          bucketName: "snapshot-first",
        }),
      }),
    );
    await cloudFormation.waitForStackDeployComplete("snapshot-stack");

    // When an update replaces it.
    await cloudFormation.updateStack(
      new UpdateStackCommand({
        StackName: "snapshot-stack",
        TemplateBody: bucketTemplate({
          attributes: { UpdateReplacePolicy: "Snapshot" },
          bucketName: "snapshot-second",
        }),
      }),
    );
    await cloudFormation.waitForStackUpdateComplete("snapshot-stack");

    // Then the deployed Bucket has gone, as a Delete policy leaves it.
    assertUndefined(simAws.s3().getSimBucketByName("snapshot-first"));
    assertNonNullable(simAws.s3().getSimBucketByName("snapshot-second"));
  });

  it("replaces a Resource its DeletionPolicy alone would have kept", async () => {
    // Given a deployed Bucket marked to survive a teardown, and nothing more.
    // CloudFormation reads DeletionPolicy for a Resource being removed, never
    // for one being replaced, so this one has nothing keeping it.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await cloudFormation.createStack(
      new CreateStackCommand({
        StackName: "kept-stack",
        TemplateBody: bucketTemplate({
          attributes: { DeletionPolicy: "Retain" },
          bucketName: "kept-first",
        }),
      }),
    );
    await cloudFormation.waitForStackDeployComplete("kept-stack");

    // When an update replaces it.
    await cloudFormation.updateStack(
      new UpdateStackCommand({
        StackName: "kept-stack",
        TemplateBody: bucketTemplate({
          attributes: { DeletionPolicy: "Retain" },
          bucketName: "kept-second",
        }),
      }),
    );
    await cloudFormation.waitForStackUpdateComplete("kept-stack");

    // Then the deployed Bucket has gone.
    assertUndefined(simAws.s3().getSimBucketByName("kept-first"));
    assertNonNullable(simAws.s3().getSimBucketByName("kept-second"));
  });
});

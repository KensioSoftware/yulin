import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimCfnResource } from "../../resource/sim-cfn-resource.js";
import { SimCfnStackResourceDeleter } from "./sim-cfn-stack-resource-deleter.js";
import { deployedResourceObject } from "../sim-cfn-stack.fixture.js";

describe("SimCfnStack teardown", () => {
  it("deletes Resources in reverse dependency order", async () => {
    // Given a Stack whose Resources depend on each other in a line, deployed
    // so every one of them exists.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "chain-stack",
      template: {
        Resources: {
          First: { Type: "AWS::CloudFormation::WaitConditionHandle" },
          Second: {
            Type: "AWS::CloudFormation::WaitConditionHandle",
            DependsOn: "First",
          },
          Third: {
            Type: "AWS::CloudFormation::WaitConditionHandle",
            DependsOn: "Second",
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    // When the Stack's Resources are torn down.
    await stack.teardown();

    // Then every Resource reports a completed deletion.
    for (const logicalId of ["First", "Second", "Third"]) {
      assertIdentical(
        stack.getResource(logicalId)?.status,
        "DELETE_COMPLETE",
        `${logicalId} status`,
      );
    }

    // And nothing was recorded as undeletable.
    assertArrayLength(stack.skippedResourceDeletions, 0);
  });

  it("leaves a Resource standing until its dependents have gone", async () => {
    // Given a Bucket policy that names its Bucket, so deleting the Bucket
    // first would leave the policy nothing to be taken off.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "ordered-stack",
      template: {
        Resources: {
          DataBucket: {
            Type: "AWS::S3::Bucket",
            Properties: { BucketName: "data" },
          },
          DataBucketPolicy: {
            Type: "AWS::S3::BucketPolicy",
            Properties: {
              Bucket: { Ref: "DataBucket" },
              PolicyDocument: {
                Version: "2012-10-17",
                Statement: [
                  {
                    Effect: "Allow",
                    Principal: { AWS: "arn:aws:iam::111111111111:root" },
                    Action: "s3:GetObject",
                    Resource: "arn:aws:s3:::data/*",
                  },
                ],
              },
            },
          },
        },
      },
    });

    // When the Stack's Resources are torn down.
    await stack.teardown();

    // Then both are gone, which only happens if the policy went first: taking
    // a policy off a Bucket that is not there is refused by S3.
    assertIdentical(
      stack.getResource("DataBucketPolicy")?.status,
      "DELETE_COMPLETE",
    );
    assertIdentical(stack.getResource("DataBucket")?.status, "DELETE_COMPLETE");
  });

  it("steps over a Resource whose type was never created", async () => {
    // Given a Stack carrying a Resource type this simulation does not create.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "skipped-stack",
      template: {
        Resources: {
          Handle: { Type: "AWS::CloudFormation::WaitConditionHandle" },
          Network: { Type: "AWS::EC2::VPC" },
        },
      },
    });
    await stack.waitForDeployComplete();

    assertArrayLength(stack.skippedResources, 1);

    // When the Stack's Resources are torn down.
    await stack.teardown();

    // Then the skipped Resource is delete-complete without any service being
    // asked to delete something it never made.
    assertIdentical(stack.getResource("Network")?.status, "DELETE_COMPLETE");
    assertArrayLength(stack.skippedResourceDeletions, 0);
  });

  it("reports Resources whose deletion nothing could carry out", async () => {
    // Given a deployed Stack where a Resource's deletion was recorded rather
    // than carried out, as an unsupported Resource type's creation is.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "unremovable-stack",
      template: {
        Resources: {
          Handle: { Type: "AWS::CloudFormation::WaitConditionHandle" },
        },
      },
    });
    await stack.waitForDeployComplete();

    const resource = stack.getResource("Handle");
    assertNonNullable(resource);

    // When that Resource records a skipped deletion.
    deployedResourceObject(resource).markDeleteSkipped(
      "nothing deletes a WaitConditionHandle",
    );

    // Then the Stack reports it, so a teardown says what it left behind.
    assertArrayLength(stack.skippedResourceDeletions, 1);
    assertIdentical(stack.skippedResourceDeletions[0], resource);
  });

  it("fails a teardown whose Resources cannot make progress", async () => {
    // Given Resources that depend on each other in a circle, so no Resource is
    // ever the last one standing.
    const simAws = new SimAws();
    const resourceLogicalIds = new Set(["Left", "Right"]);
    const resourceOf = (logicalId: string, dependsOn: string): SimCfnResource =>
      new SimCfnResource({
        logicalId,
        template: {
          Type: "AWS::CloudFormation::WaitConditionHandle",
          DependsOn: dependsOn,
        },
        resourceLogicalIds,
      });
    const resources = new Map([
      ["Left", resourceOf("Left", "Right")],
      ["Right", resourceOf("Right", "Left")],
    ]);

    // When the Resources are torn down.
    const error = await assertThrowsErrorAsync(async () =>
      new SimCfnStackResourceDeleter({
        simAws,
        resources,
        stackName: "cyclic-stack",
      }).deleteAll(),
    );

    // Then the teardown reports the deadlock, naming the Stack, as deployment
    // reports the same template.
    assertStringIncludes(error.message, "cyclic-stack");
    assertStringIncludes(error.message, "Could not resolve");
  });
});

import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringStartsWith,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { SimS3Bucket } from "../bucket/sim-s3-bucket.js";
import type { SimCloudFormationResourceCreateContext } from "../../cloudformation/resource/sim-cfn-resource.js";
import { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import { SimS3CloudFormationResourceFactory } from "./sim-cfn-s3-resource-factory.js";
import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import { BackgroundTasks } from "../../../util/background/background.js";

describe("SimS3CloudFormationResourceFactory", () => {
  it("creates an S3 Bucket using the configured BucketName", async () => {
    // Given an S3 CloudFormation Resource factory and a Bucket resource with an
    // explicit BucketName.
    const background = new BackgroundTasks();
    const simAws = new SimAws({ background });
    const simS3 = simAws.s3();
    const resource = new SimCfnResource({
      accountRegionScope: {
        accountId: "111111111111" as SimAwsAccountId,
        regionName: "eu-west-2",
      },
      logicalId: "ExampleBucket",
      template: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: "example-bucket",
        },
      },
    });
    const context: SimCloudFormationResourceCreateContext = {
      simAws,
      resources: new Map(),
    };
    const factory = new SimS3CloudFormationResourceFactory(simS3);

    // When the Bucket resource type is created.
    const bucket = await factory.create("Bucket", resource, context);

    // Then the named Bucket is created and returned.
    const storedBucket = simS3.getSimBucketByName("example-bucket");

    assertNonNullable(storedBucket);
    assertIdentical(bucket, storedBucket);
  });

  it("names a Bucket created outside a stack after the logical ID alone", async () => {
    // Given an S3 CloudFormation Resource factory and a Bucket resource without a
    // BucketName.
    const simAws = new SimAws();
    const simS3 = simAws.s3();
    const resource = new SimCfnResource({
      accountRegionScope: {
        accountId: "111111111111" as SimAwsAccountId,
        regionName: "eu-west-2",
      },
      logicalId: "ExampleBucket",
      template: {
        Type: "AWS::S3::Bucket",
      },
    });
    const context: SimCloudFormationResourceCreateContext = {
      simAws,
      resources: new Map(),
    };
    const factory = new SimS3CloudFormationResourceFactory(simS3);

    // When the Bucket resource type is created.
    const bucket = await factory.create("Bucket", resource, context);

    // Then the name falls back to the logical ID, since there is no stack
    // name to put in front of it, lower cased as a bucket name has to be.
    assertInstanceOf(bucket, SimS3Bucket);
    assertStringStartsWith(bucket.bucketName, "examplebucket-");

    const storedBucket = simS3.getSimBucketByName(bucket.bucketName);

    assertNonNullable(storedBucket);
    assertIdentical(bucket, storedBucket);
  });

  it("rejects unsupported S3 resource types", async () => {
    // Given an S3 CloudFormation Resource factory and an unsupported Resource type.
    const simAws = new SimAws();
    const simS3 = simAws.s3();
    const resource = new SimCfnResource({
      accountRegionScope: {
        accountId: "111111111111" as SimAwsAccountId,
        regionName: "eu-west-2",
      },
      logicalId: "ExampleUnsupportedResource",
      template: {
        Type: "AWS::S3::UnsupportedResource",
      },
    });
    const context: SimCloudFormationResourceCreateContext = {
      simAws,
      resources: new Map(),
    };
    const factory = new SimS3CloudFormationResourceFactory(simS3);

    // When creation is attempted, then it rejects with an unsupported Resource
    // type error.
    const error = await assertThrowsErrorAsync(async () =>
      factory.create("UnsupportedResource", resource, context),
    );

    // Then the unsupported Resource type name is included for diagnosis.
    assertIdentical(
      error.message,
      "Unsupported sim S3 CloudFormation Resource UnsupportedResource",
    );
  });
});

import {
  ListBucketsCommand,
  PutBucketWebsiteCommand,
} from "@aws-sdk/client-s3";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimS3Bucket } from "../../bucket/sim-s3-bucket.js";
import { SimS3BucketAlreadyExists } from "../../error/sim-s3.error.js";
import { makeAwsRegionName } from "../../../aws/sim-aws-region.js";

describe("S3 CloudFormation Bucket Resource", () => {
  it("creates a simulated S3 Bucket from an AWS::S3::Bucket Resource", async () => {
    // Given a CloudFormation template declaring an S3 Bucket Resource.
    const bucketTemplate = {
      Resources: {
        TestBucket: {
          Type: "AWS::S3::Bucket",
          Properties: {
            BucketName: "test-bucket",
          },
        },
      },
    };

    // When the template is deployed through sim CloudFormation.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();
    const stack = await cloudFormation.deployTemplate({
      stackName: "test-stack",
      template: bucketTemplate,
    });

    // Then sim CloudFormation creates the Bucket in sim S3.
    const listBucketsOutput = await simAws
      .s3()
      .listBuckets(new ListBucketsCommand());

    assertArrayLength(listBucketsOutput.Buckets, 1);
    assertIdentical(listBucketsOutput.Buckets[0].Name, "test-bucket");

    const bucket = simAws.s3().getSimBucketByName("test-bucket");

    assertNonNullable(bucket);
    assertInstanceOf(bucket, SimS3Bucket);

    const resource = stack.getResource("TestBucket");

    assertNonNullable(resource);
    assertIdentical(resource.status, "CREATE_COMPLETE");
    assertIdentical(resource.simResource, bucket);
  });

  it("uses the logical ID as the Bucket name when BucketName is not specified", async () => {
    // Given a CloudFormation template declaring an S3 Bucket without BucketName.
    const unnamedBucketTemplate = {
      Resources: {
        TestBucket: {
          Type: "AWS::S3::Bucket",
        },
      },
    };

    // When the template is deployed through simulated CloudFormation.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();
    const stack = await cloudFormation.deployTemplate({
      stackName: "test-stack",
      template: unnamedBucketTemplate,
    });

    // Then the simulated S3 Bucket is created using the logical ID fallback.
    const bucket = simAws.s3().getSimBucketByName("testbucket");

    assertNonNullable(bucket);
    assertInstanceOf(bucket, SimS3Bucket);
    assertIdentical(bucket.bucketName, "testbucket");

    const resource = stack.getResource("TestBucket");

    assertNonNullable(resource);
    assertIdentical(resource.status, "CREATE_COMPLETE");
    assertIdentical(resource.simResource, bucket);
  });

  it("creates Buckets in the CloudFormation Account Region scope and rejects duplicate names from another scope", async () => {
    // Given CloudFormation in one specific Account Region scope and another
    // CloudFormation service in a different Account Region scope.
    const bucketTemplate = {
      Resources: {
        TestBucket: {
          Type: "AWS::S3::Bucket",
          Properties: {
            BucketName: "scoped-test-bucket",
          },
        },
      },
    };
    const simAws = new SimAws();
    const firstScopeCfn = simAws
      .account("111111111111")
      .region("eu-west-1")
      .cloudFormation();
    const otherScopeCfn = simAws
      .account("222222222222")
      .region("eu-west-2")
      .cloudFormation();

    // When the Bucket template is deployed through the first scoped
    // CloudFormation service.
    await firstScopeCfn.deployTemplate({
      stackName: "source-stack",
      template: bucketTemplate,
    });

    // Then the Bucket exists in that Account Region scope.
    const firstScopeBucket = simAws
      .account("111111111111")
      .region("eu-west-1")
      .s3()
      .getSimBucketByName("scoped-test-bucket");
    const otherScopeBucket = simAws
      .account("222222222222")
      .region("eu-west-2")
      .s3()
      .getSimBucketByName("scoped-test-bucket");

    assertNonNullable(firstScopeBucket);
    assertInstanceOf(firstScopeBucket, SimS3Bucket);
    assertUndefined(otherScopeBucket);

    // When the same Bucket name is deployed through CloudFormation in the other
    // Account Region scope, then S3's global Bucket name uniqueness is enforced.
    const error = await assertThrowsErrorAsync(async () =>
      otherScopeCfn.deployTemplate({
        stackName: "other-stack",
        template: bucketTemplate,
      }),
    );
    assertInstanceOf(error, SimS3BucketAlreadyExists);
  });

  it("returns an S3 Bucket WebsiteURL attribute value", async () => {
    // Given an S3 Bucket Resource deployed by sim CloudFormation.
    const simAws = new SimAws();
    const region = makeAwsRegionName();
    const simCloudFormation = simAws.region(region).cloudFormation();
    const simS3 = simAws.region(region).s3();
    const stack = await simCloudFormation.deployTemplate({
      stackName: "test-stack",
      template: {
        Resources: {
          WebsiteBucket: {
            Type: "AWS::S3::Bucket",
            Properties: {
              BucketName: "website-bucket",
            },
          },
        },
      },
    });

    // And static website hosting enabled on the Bucket.
    await simS3.putBucketWebsite(
      new PutBucketWebsiteCommand({
        Bucket: "website-bucket",
        WebsiteConfiguration: {
          IndexDocument: {
            Suffix: "index.html",
          },
        },
      }),
    );

    // When the Resource's WebsiteURL attribute is read.
    const bucketResource = stack.getResource("WebsiteBucket");
    const bucket = simS3.getSimBucketByName("website-bucket");

    assertNonNullable(bucketResource);
    assertNonNullable(bucket);

    // Then the CloudFormation S3 adapter returns the simulated website URL.
    assertIdentical(
      bucketResource.attributeValue("WebsiteURL"),
      `http://website-bucket.s3-website.${region}.sim-aws.localhost/`,
    );
  });

  it("returns S3 Bucket Arn, DomainName, and RegionalDomainName attribute values", async () => {
    // Given an S3 Bucket Resource deployed by sim CloudFormation in a specific
    // Region.
    const simAws = new SimAws();
    const region = makeAwsRegionName();
    const stack = await simAws
      .region(region)
      .cloudFormation()
      .deployTemplate({
        stackName: "test-stack",
        template: {
          Resources: {
            AttributeBucket: {
              Type: "AWS::S3::Bucket",
              Properties: {
                BucketName: "attribute-bucket",
              },
            },
          },
        },
      });

    // When the Resource's S3 Bucket attributes are read.
    const bucketResource = stack.getResource("AttributeBucket");

    assertNonNullable(bucketResource);

    // Then the CloudFormation S3 adapter returns AWS-compatible values.
    assertIdentical(
      bucketResource.attributeValue("Arn"),
      "arn:aws:s3:::attribute-bucket",
    );
    assertIdentical(
      bucketResource.attributeValue("DomainName"),
      "attribute-bucket.s3.amazonaws.com",
    );
    assertIdentical(
      bucketResource.attributeValue("RegionalDomainName"),
      `attribute-bucket.s3.${region}.amazonaws.com`,
    );
  });
});

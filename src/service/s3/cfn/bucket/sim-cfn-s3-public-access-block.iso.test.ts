import { GetPublicAccessBlockCommand } from "@aws-sdk/client-s3";
import {
  assertInstanceOf,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimS3AccessDenied } from "../../error/sim-s3.error.js";

describe("S3 CloudFormation PublicAccessBlockConfiguration", () => {
  const publicReadStatement = {
    Effect: "Allow",
    Principal: "*",
    Action: "s3:GetObject",
    Resource: "arn:aws:s3:::site/*",
  };

  it("applies PublicAccessBlockConfiguration when the Bucket is created", async () => {
    // Given a template opening one Block Public Access setting.
    const simAws = new SimAws();

    // When the template is deployed.
    await simAws.cloudFormation().deployTemplate({
      stackName: "configured-stack",
      template: {
        Resources: {
          SiteBucket: {
            Type: "AWS::S3::Bucket",
            Properties: {
              BucketName: "site",
              PublicAccessBlockConfiguration: {
                BlockPublicPolicy: false,
                RestrictPublicBuckets: false,
              },
            },
          },
        },
      },
    });

    // Then the Bucket carries those settings, with the unspecified ones at
    // their blocked default.
    const output = await simAws
      .s3()
      .getPublicAccessBlock(
        new GetPublicAccessBlockCommand({ Bucket: "site" }),
      );

    assertObjectEquals(output.PublicAccessBlockConfiguration, {
      BlockPublicAcls: true,
      IgnorePublicAcls: true,
      BlockPublicPolicy: false,
      RestrictPublicBuckets: false,
    });
  });

  it("blocks public access on a Bucket that declares no configuration", async () => {
    // Given a template with a plain Bucket.
    const simAws = new SimAws();

    // When the template is deployed.
    await simAws.cloudFormation().deployTemplate({
      stackName: "default-stack",
      template: {
        Resources: {
          SiteBucket: {
            Type: "AWS::S3::Bucket",
            Properties: { BucketName: "site" },
          },
        },
      },
    });

    // Then it starts fully blocked, as a new Bucket does in real S3.
    const output = await simAws
      .s3()
      .getPublicAccessBlock(
        new GetPublicAccessBlockCommand({ Bucket: "site" }),
      );

    assertObjectEquals(output.PublicAccessBlockConfiguration, {
      BlockPublicAcls: true,
      IgnorePublicAcls: true,
      BlockPublicPolicy: true,
      RestrictPublicBuckets: true,
    });
  });

  it("fails the Stack when a public Bucket policy is blocked", async () => {
    // Given a template attaching a public policy to a Bucket that has not
    // opted out of blocking them.
    const simAws = new SimAws();

    // When the template is deployed.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.cloudFormation().deployTemplate({
        stackName: "blocked-stack",
        template: {
          Resources: {
            SiteBucket: {
              Type: "AWS::S3::Bucket",
              Properties: { BucketName: "site" },
            },
            SiteBucketPolicy: {
              Type: "AWS::S3::BucketPolicy",
              Properties: {
                Bucket: { Ref: "SiteBucket" },
                PolicyDocument: {
                  Version: "2012-10-17",
                  Statement: [publicReadStatement],
                },
              },
            },
          },
        },
      }),
    );

    // Then the Stack fails, naming the logical ID and the setting that
    // refused the policy, rather than deploying a Bucket real S3 would not.
    assertInstanceOf(error, SimS3AccessDenied);
    assertStringIncludes(error.message, "SiteBucketPolicy");
    assertStringIncludes(error.message, "BlockPublicPolicy");
  });

  it("deploys the same public policy when the Bucket opts out", async () => {
    // Given the same template with the Bucket opting out of the block.
    const simAws = new SimAws();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "opted-out-stack",
      template: {
        Resources: {
          SiteBucket: {
            Type: "AWS::S3::Bucket",
            Properties: {
              BucketName: "site",
              PublicAccessBlockConfiguration: { BlockPublicPolicy: false },
            },
          },
          SiteBucketPolicy: {
            Type: "AWS::S3::BucketPolicy",
            Properties: {
              Bucket: { Ref: "SiteBucket" },
              PolicyDocument: {
                Version: "2012-10-17",
                Statement: [publicReadStatement],
              },
            },
          },
        },
      },
    });

    // Then the Stack deploys and the policy is attached.
    const resource = stack.resources.get("SiteBucketPolicy");
    assertStringIncludes(resource?.status ?? "", "CREATE_COMPLETE");
  });
});

import { CreateBucketCommand } from "@aws-sdk/client-s3";
import {
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../aws/sim-aws.js";
import { makeSimAwsAccountId } from "../aws/sim-aws-account.js";
import type { CfnTemplateBodyRecord } from "../cloudformation/template/sim-cfn-template.js";

/**
 * The commonest shape of Region-confining service control policy: everything
 * asked for in a Region the Account has no business in is denied.
 */
const denyNorthVirginia = {
  Version: "2012-10-17",
  Statement: {
    Sid: "DenyNorthVirginia",
    Effect: "Deny",
    Action: "*",
    Resource: "*",
    Condition: { StringEquals: { "aws:RequestedRegion": "us-east-1" } },
  },
} as const;

/**
 * The template CDK synthesizes for a Stack holding one Bucket.
 */
function bucketTemplate(bucketName: string): CfnTemplateBodyRecord {
  return {
    Resources: {
      ReportsBucket: {
        Type: "AWS::S3::Bucket",
        Properties: { BucketName: bucketName },
      },
    },
  };
}

describe("Simulated Organizations Region-confining service control policy", () => {
  it("denies a Bucket created in the Region the organization denies", async () => {
    // Given an Account whose organization denies everything in us-east-1.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });

    simAws
      .organizations()
      .attachServiceControlPolicy(accountId, denyNorthVirginia);

    // When a Bucket is created there.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .accountRegionScope(accountId, "us-east-1")
        .s3()
        .createBucket(
          new CreateBucketCommand({ Bucket: `${accountId}-reports` }),
        );
    });

    // Then S3 supplied its own Region and the organization denied the request.
    assertStringIncludes(error.message, "s3:CreateBucket");
    assertStringIncludes(error.message, "service control policy");
  });

  it("allows the same Bucket in a Region the organization leaves alone", async () => {
    // Given the same organization, denying only us-east-1.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });

    simAws
      .organizations()
      .attachServiceControlPolicy(accountId, denyNorthVirginia);

    // When the Bucket is created in eu-west-2 instead.
    const output = await simAws
      .accountRegionScope(accountId, "eu-west-2")
      .s3()
      .createBucket(
        new CreateBucketCommand({ Bucket: `${accountId}-reports` }),
      );

    // Then it was created, because the Region S3 supplied is not the denied
    // one.
    assertIdentical(output.Location, `/${accountId}-reports`);
  });

  it("deploys a Stack in the Region the Stack is deployed into", async () => {
    // Given the same organization, and a Stack holding one Bucket.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });

    simAws
      .organizations()
      .attachServiceControlPolicy(accountId, denyNorthVirginia);

    // When the Stack is deployed into eu-west-2 and then into us-east-1.
    await simAws
      .accountRegionScope(accountId, "eu-west-2")
      .cloudFormation()
      .deployTemplate({
        stackName: "reports-stack",
        template: bucketTemplate(`${accountId}-london-reports`),
      });

    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .accountRegionScope(accountId, "us-east-1")
        .cloudFormation()
        .deployTemplate({
          stackName: "reports-stack",
          template: bucketTemplate(`${accountId}-virginia-reports`),
        });
    });

    // Then the deployment carried the Region of the Stack it was deploying,
    // rather than the Region of whoever asked for the deployment.
    assertStringIncludes(error.message, "s3:CreateBucket");
    assertStringIncludes(error.message, "service control policy");
  });
});

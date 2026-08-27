import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../aws/sim-aws.js";
import { makeSimAwsAccountId } from "../aws/sim-aws-account.js";
import { SimIamAccessDenied } from "../iam/error/sim-iam.error.js";
import { SimSdk } from "../../sdk/index.js";

const denyBucketCreation = {
  Version: "2012-10-17",
  Statement: {
    Effect: "Deny",
    Action: "s3:CreateBucket",
    Resource: "*",
  },
} as const;

describe("Simulated Organizations service control policies at deployment", () => {
  it("fails a CloudFormation Resource its service control policy denies", async () => {
    // Given an Account whose organization denies creating Buckets.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });

    simAws
      .organizations()
      .attachServiceControlPolicy(accountId, denyBucketCreation);

    // When a Stack declaring a Bucket is deployed into it.
    const error = await assertThrowsErrorAsync(async () => {
      const stack = await simAws.cloudFormation().deployTemplate({
        stackName: "reports-stack",
        template: {
          Resources: {
            ReportsBucket: {
              Type: "AWS::S3::Bucket",
              Properties: { BucketName: "reports-bucket" },
            },
          },
        },
      });

      await stack.waitForDeployComplete();
    });

    // Then the Resource failed, the Bucket was never created, and the error
    // says which kind of policy stopped it.
    assertStringIncludes(
      error.message,
      "with an explicit deny in a service control policy",
    );
    assertIdentical(
      simAws
        .cloudFormation()
        .getStackByName("reports-stack")
        ?.getResource("ReportsBucket")?.status,
      "CREATE_FAILED",
    );
    assertUndefined(simAws.s3().getSimBucketByName("reports-bucket"));
  });

  it("denies an intercepted SDK call made under a run-as caller", async () => {
    // Given an Account whose organization denies creating Buckets.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });

    simAws
      .organizations()
      .attachServiceControlPolicy(accountId, denyBucketCreation);

    const s3 = new S3Client({ region: "eu-west-1" });
    new SimSdk({ simAws }).intercept(s3);

    // When an intercepted client asks for a Bucket as the Account root.
    const error = await simAws.runAs(
      { kind: "arn", arn: `arn:aws:iam::${accountId}:root` },
      async () =>
        await assertThrowsErrorAsync(async () => {
          await s3.send(new CreateBucketCommand({ Bucket: "reports-bucket" }));
        }),
    );

    // Then the organization denied it before S3 held anything.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "s3:CreateBucket");
    assertStringIncludes(
      error.message,
      "with an explicit deny in a service control policy",
    );
    assertUndefined(simAws.s3().getSimBucketByName("reports-bucket"));
  });
});

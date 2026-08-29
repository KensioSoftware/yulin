import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertStringStartsWith,
  assertThrowsErrorAsync,
  assertTypeString,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import { makeSimAwsAccountId } from "../../aws/sim-aws-account.js";
import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import type { SimIamPolicyDocumentStatement } from "../../iam/policy/sim-iam-policy.js";
import { jsonStringify } from "../../../util/type-guard/json.js";

/** A Stack whose Bucket leaves CloudFormation to name it. */
const assetsStackTemplate = {
  Resources: { AssetsBucket: { Type: "AWS::S3::Bucket" } },
};

describe("a deployment authorized against the names it generates", () => {
  it("creates a Bucket a Role scoped to the Stack's own prefix allows", async () => {
    // Given a deploy Role allowed to create buckets only under the prefix its
    // own Stack generates names with, which is how an account scopes one.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const deployer = await deployRole(simAws, accountId, [
      {
        Effect: "Allow",
        Action: "s3:CreateBucket",
        Resource: "arn:aws:s3:::analytics-stack-*",
      },
    ]);

    // When it deploys the Stack the prefix names.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "analytics-stack",
      template: assetsStackTemplate,
      caller: deployer,
    });

    // Then the Bucket was created, because the name carries the Stack.
    const bucketName = stack.getResource("AssetsBucket")?.refValue;

    assertTypeString(bucketName);
    assertStringStartsWith(bucketName, "analytics-stack-assetsbucket-");
    assertIdentical(
      stack.getResource("AssetsBucket")?.status,
      "CREATE_COMPLETE",
    );
    assertNonNullable(simAws.s3().getSimBucketByName(bucketName));

    await simAws.backgroundTasksComplete();
  });

  it("refuses a Bucket whose Stack is outside the prefix the Role allows", async () => {
    // Given the same Role, and a Stack named something else, which is the
    // decision the prefix exists to make.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const deployer = await deployRole(simAws, accountId, [
      {
        Effect: "Allow",
        Action: "s3:CreateBucket",
        Resource: "arn:aws:s3:::analytics-stack-*",
      },
    ]);

    // When that Role deploys the same template under another Stack name.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "reporting-stack",
        template: assetsStackTemplate,
        caller: deployer,
      });
    });

    // Then the Bucket was refused, naming the Bucket the Stack asked for.
    assertStringIncludes(error.message, "s3:CreateBucket");
    assertStringIncludes(error.message, "reporting-stack-assetsbucket-");
  });
});

/** A Role a deployment can run as, carrying the statements it is given. */
async function deployRole(
  simAws: SimAws,
  accountId: SimAwsAccountId,
  statements: readonly SimIamPolicyDocumentStatement[],
): Promise<SimAwsCaller> {
  const roleName = "deployer";
  const iam = simAws.account(accountId).iam();

  await iam.createRole({
    input: {
      RoleName: roleName,
      AssumeRolePolicyDocument: jsonStringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Action: "sts:AssumeRole",
          Principal: { Service: "cloudformation.amazonaws.com" },
        },
      }),
    },
  });

  await iam.putRolePolicy({
    input: {
      RoleName: roleName,
      PolicyName: `${roleName}-policy`,
      PolicyDocument: jsonStringify({
        Version: "2012-10-17",
        Statement: statements,
      }),
    },
  });

  return { kind: "arn", arn: `arn:aws:iam::${accountId}:role/${roleName}` };
}

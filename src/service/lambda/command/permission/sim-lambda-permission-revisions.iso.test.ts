import {
  AddPermissionCommand,
  CreateFunctionCommand,
  GetPolicyCommand,
  RemovePermissionCommand,
} from "@aws-sdk/client-lambda";
import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimLambdaPreconditionFailedException } from "../../error/sim-lambda.error.js";
import { makeLambdaZipFileInput } from "../../function/code/lambda-zip-file-input.js";

async function simAwsWithGrant(): Promise<SimAws> {
  const simAws = new SimAws();
  await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: "orders",
      Role: `arn:aws:iam::${simAws.defaultAccountId}:role/OrdersRole`,
      Code: { ZipFile: makeLambdaZipFileInput(() => "handled") },
    }),
  );
  await simAws.lambda().addPermission(
    new AddPermissionCommand({
      FunctionName: "orders",
      StatementId: "AllowS3",
      Action: "lambda:InvokeFunction",
      Principal: "s3.amazonaws.com",
    }),
  );

  return simAws;
}

async function policyRevision(simAws: SimAws): Promise<string | undefined> {
  const { RevisionId } = await simAws
    .lambda()
    .getPolicy(new GetPolicyCommand({ FunctionName: "orders" }));

  return RevisionId;
}

describe("Lambda permission revisions", () => {
  it("adds and removes a statement while the policy is at the revision named", async () => {
    // Given a policy and its current revision.
    const simAws = await simAwsWithGrant();

    // When a statement is added naming that revision, and removed naming the
    // revision the addition moved the policy to.
    await simAws.lambda().addPermission(
      new AddPermissionCommand({
        FunctionName: "orders",
        StatementId: "AllowSns",
        Action: "lambda:InvokeFunction",
        Principal: "sns.amazonaws.com",
        RevisionId: await policyRevision(simAws),
      }),
    );
    await simAws.lambda().removePermission(
      new RemovePermissionCommand({
        FunctionName: "orders",
        StatementId: "AllowSns",
        RevisionId: await policyRevision(simAws),
      }),
    );

    // Then both apply, leaving the first grant alone.
    const policy = await simAws
      .lambda()
      .getPolicy(new GetPolicyCommand({ FunctionName: "orders" }));
    assertStringIncludes(policy.Policy, "AllowS3");
  });

  it("refuses a change naming a revision the policy has moved on from", async () => {
    // Given a revision read before the policy changed.
    const simAws = await simAwsWithGrant();
    const stale = await policyRevision(simAws);
    await simAws.lambda().addPermission(
      new AddPermissionCommand({
        FunctionName: "orders",
        StatementId: "AllowSns",
        Action: "lambda:InvokeFunction",
        Principal: "sns.amazonaws.com",
      }),
    );

    // When a removal names it.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.lambda().removePermission(
        new RemovePermissionCommand({
          FunctionName: "orders",
          StatementId: "AllowS3",
          RevisionId: stale,
        }),
      ),
    );

    // Then it is refused as real Lambda refuses it.
    assertInstanceOf(error, SimLambdaPreconditionFailedException);
  });
});

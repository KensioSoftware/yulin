import {
  CreateFunctionCommand,
  DescribeFunctionCommand,
  GetFunctionCommand,
  ListFunctionsCommand,
} from "@aws-sdk/client-cloudfront";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";

const functionCode = Buffer.from(`
  function handler(event) {
    return event.request;
  }
`);

/**
 * A Role in the given Account, granted one policy statement.
 */
async function roleGranted(
  simAws: SimAws,
  accountId: SimAwsAccountId,
  roleName: string,
  statement: object,
): Promise<string> {
  const simIam = simAws.account(accountId).iam();
  const roleCreation = await simIam.createRole(
    new CreateRoleCommand({
      RoleName: roleName,
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Principal: { AWS: `arn:aws:iam::${accountId}:root` },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );

  await simIam.putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: roleName,
      PolicyName: "FunctionAccess",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: statement,
      }),
    }),
  );

  return roleCreation.Role.Arn;
}

/**
 * A published Function in the given Account, created by its root caller.
 */
async function givenFunction(
  simAws: SimAws,
  accountId: SimAwsAccountId,
  name: string,
): Promise<void> {
  await simAws
    .account(accountId)
    .cloudFront()
    .createFunction(
      new CreateFunctionCommand({
        Name: name,
        FunctionConfig: { Comment: name, Runtime: "cloudfront-js-2.0" },
        FunctionCode: functionCode,
      }),
    );
  await simAws.backgroundTasksComplete();
}

describe("CloudFront Function read IAM authorization", () => {
  it("allows a Role granted the read actions on the Function", async () => {
    // Given a Function, and a Role allowed to read it.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    await givenFunction(simAws, accountId, "readable-cff");
    const roleArn = await roleGranted(simAws, accountId, "FunctionReader", {
      Effect: "Allow",
      Action: ["cloudfront:DescribeFunction", "cloudfront:GetFunction"],
      Resource: `arn:aws:cloudfront::${accountId}:function/readable-cff`,
    });
    const simCloudFront = simAws.account(accountId).cloudFront();
    const caller = { kind: "arn", arn: roleArn } as const;

    // When the Role describes the Function and reads its code.
    const described = await simCloudFront.describeFunction(
      new DescribeFunctionCommand({ Name: "readable-cff" }),
      { caller },
    );
    const got = await simCloudFront.getFunction(
      new GetFunctionCommand({ Name: "readable-cff" }),
      { caller },
    );

    // Then IAM permits both.
    assertIdentical(described.FunctionSummary.Name, "readable-cff");
    assertIdentical(got.ETag, described.ETag);
  });

  it("denies a listing to a Role granted only one Function", async () => {
    // Given a Role allowed to read one Function by name, which is not what a
    // policy for the Account-wide listing has to say.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    await givenFunction(simAws, accountId, "readable-cff");
    const roleArn = await roleGranted(simAws, accountId, "OneFunctionReader", {
      Effect: "Allow",
      Action: "cloudfront:ListFunctions",
      Resource: `arn:aws:cloudfront::${accountId}:function/readable-cff`,
    });

    // When the Role lists the Account's Functions.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .account(accountId)
        .cloudFront()
        .listFunctions(new ListFunctionsCommand({}), {
          caller: { kind: "arn", arn: roleArn },
        }),
    );

    // Then IAM refuses it.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "cloudfront:ListFunctions");
  });

  it("allows a listing to a Role granted the Function wildcard", async () => {
    // Given a Function, and a Role allowed to list any of them.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    await givenFunction(simAws, accountId, "readable-cff");
    const roleArn = await roleGranted(simAws, accountId, "FunctionLister", {
      Effect: "Allow",
      Action: "cloudfront:ListFunctions",
      Resource: `arn:aws:cloudfront::${accountId}:function/*`,
    });

    // When the Role lists the Account's Functions.
    const listed = await simAws
      .account(accountId)
      .cloudFront()
      .listFunctions(new ListFunctionsCommand({}), {
        caller: { kind: "arn", arn: roleArn },
      });

    // Then IAM permits it.
    assertIdentical(listed.FunctionList.Quantity, 1);
  });

  it("denies a caller before it learns whether a Function exists", async () => {
    // Given a simulation holding no Function of that name.
    const simCloudFront = new SimAws().cloudFront();

    // When an anonymous caller describes it.
    const error = await assertThrowsErrorAsync(async () =>
      simCloudFront.describeFunction(
        new DescribeFunctionCommand({ Name: "no-such-cff" }),
        { caller: { kind: "anonymous" } },
      ),
    );

    // Then IAM refuses it rather than answering NoSuchFunctionExists, so a
    // caller without permission learns nothing about what the Account holds.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "cloudfront:DescribeFunction");
  });
});

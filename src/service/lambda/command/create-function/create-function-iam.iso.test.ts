import { CreateFunctionCommand } from "@aws-sdk/client-lambda";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { SimLambda } from "../../sim-lambda.js";
import { makeLambdaZipFileInput } from "../../function/code/lambda-zip-file-input.js";

function createFunctionCommand(
  functionName: string,
  roleArn: string,
): CreateFunctionCommand {
  return new CreateFunctionCommand({
    FunctionName: functionName,
    Role: roleArn,
    Code: {
      ZipFile: makeLambdaZipFileInput(() => null),
    },
  });
}

describe("Lambda CreateFunctionCommand IAM authorization", () => {
  it("allows the default Account root caller", async () => {
    // Given an Account and Region-scoped Lambda service.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });

    // When CreateFunction is called without an explicit caller.
    const output = await simAws
      .lambda()
      .createFunction(
        createFunctionCommand(
          "root-function",
          `arn:aws:iam::${accountId}:role/ExecutionRole`,
        ),
      );

    // Then IAM defaults to Account root and Lambda creates the function.
    assertIdentical(output.FunctionName, "root-function");

    await simAws.backgroundTasksComplete();
  });

  it("allows a Role when its policy permits lambda:CreateFunction", async () => {
    // Given a Role allowed to create a specific Lambda function.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const simIam = simAws.iam();

    const roleCreation = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "FunctionCreator",
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
        RoleName: "FunctionCreator",
        PolicyName: "CreateFunctionPolicy",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "lambda:CreateFunction",
            Resource:
              `arn:aws:lambda:${simAws.defaultRegionName}:` +
              `${accountId}:function:allowed-function`,
          },
        }),
      }),
    );

    // When the Role creates the function it has permission for.
    const output = await simAws
      .lambda()
      .createFunction(
        createFunctionCommand(
          "allowed-function",
          `arn:aws:iam::${accountId}:role/ExecutionRole`,
        ),
        { caller: { kind: "arn", arn: roleCreation.Role.Arn } },
      );

    // Then IAM allows the request and Lambda creates the function.
    assertIdentical(output.FunctionName, "allowed-function");

    await simAws.backgroundTasksComplete();
  });

  it("implicitly denies a Role with no matching policy", async () => {
    // Given a Role with no Lambda permissions.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });

    const roleCreation = await simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: "NoPermissionsRole",
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

    // When the Role attempts to create a function.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .lambda()
        .createFunction(
          createFunctionCommand(
            "denied-function",
            `arn:aws:iam::${accountId}:role/ExecutionRole`,
          ),
          { caller: { kind: "arn", arn: roleCreation.Role.Arn } },
        ),
    );

    // Then IAM implicitly denies the request.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "lambda:CreateFunction");
  });

  it("uses allow-all authorization when SimLambda is instantiated directly", async () => {
    // Given a directly constructed Lambda service with no IAM supplied.
    const simLambda = new SimLambda();

    // When an anonymous caller creates a function through the standalone
    // service.
    const output = await simLambda.createFunction(
      createFunctionCommand(
        "standalone-function",
        "arn:aws:iam::111111111111:role/ExecutionRole",
      ),
      { caller: { kind: "anonymous" } },
    );

    // Then the allow-all fallback permits the request.
    assertIdentical(output.FunctionName, "standalone-function");
  });
});

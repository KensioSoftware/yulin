import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
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
import { makeLambdaZipFileInput } from "../../function/code/lambda-zip-file-input.js";

async function createCallerRole(
  simAws: SimAws,
  accountId: string,
  roleName: string,
): Promise<string> {
  const roleCreation = await simAws
    .account(accountId)
    .iam()
    .createRole(
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
  return roleCreation.Role.Arn;
}

describe("Lambda InvokeCommand IAM authorization", () => {
  it("allows a Role when its policy permits lambda:InvokeFunction", async () => {
    // Given a function and a Role allowed to invoke it.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const simLambda = simAws.lambda();
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "invokable",
        Role: `arn:aws:iam::${accountId}:role/ExecutionRole`,
        Code: {
          ZipFile: makeLambdaZipFileInput(() => "invoked"),
        },
      }),
    );

    const callerRoleArn = await createCallerRole(
      simAws,
      accountId,
      "FunctionInvoker",
    );
    await simAws.iam().putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "FunctionInvoker",
        PolicyName: "InvokePolicy",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "lambda:InvokeFunction",
            Resource:
              `arn:aws:lambda:${simAws.defaultRegionName}:` +
              `${accountId}:function:invokable`,
          },
        }),
      }),
    );

    // When the Role invokes the function.
    const output = await simLambda.invoke(
      new InvokeCommand({ FunctionName: "invokable" }),
      { caller: { kind: "arn", arn: callerRoleArn } },
    );

    // Then IAM allows the request and the handler runs.
    assertIdentical(output.StatusCode, 200);

    await simAws.backgroundTasksComplete();
  });

  it("implicitly denies a Role with no matching policy", async () => {
    // Given a function and a Role with no Lambda permissions.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const simLambda = simAws.lambda();
    let invocations = 0;
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "guarded",
        Role: `arn:aws:iam::${accountId}:role/ExecutionRole`,
        Code: {
          ZipFile: makeLambdaZipFileInput(() => {
            invocations += 1;
            return null;
          }),
        },
      }),
    );

    const callerRoleArn = await createCallerRole(
      simAws,
      accountId,
      "NoPermissionsRole",
    );

    // When the Role attempts to invoke the function.
    const error = await assertThrowsErrorAsync(async () =>
      simLambda.invoke(new InvokeCommand({ FunctionName: "guarded" }), {
        caller: { kind: "arn", arn: callerRoleArn },
      }),
    );

    // Then IAM implicitly denies the request and the handler never runs.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "lambda:InvokeFunction");
    assertIdentical(invocations, 0);

    await simAws.backgroundTasksComplete();
  });
});

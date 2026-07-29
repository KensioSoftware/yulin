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
import { simIamPolicyDocumentFactory } from "../../../iam/policy/sim-iam-policy-document.factory.js";
import { makeLambdaZipFileInput } from "../../function/code/lambda-zip-file-input.js";

describe("Lambda InvokeCommand IAM authorization", () => {
  it("allows a Role when its policy permits lambda:InvokeFunction", async () => {
    // Given a function.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const simLambda = simAws.lambda();
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "invokable",
        Role: `arn:aws:iam::${accountId}:role/ExecutionRole`,
        Code: { ZipFile: makeLambdaZipFileInput(() => "invoked") },
      }),
    );

    // And a Role in the same Account.
    const roleCreation = await simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: "FunctionInvoker",
        AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Principal: { AWS: `arn:aws:iam::${accountId}:root` },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );

    // And an identity policy allowing that Role to invoke the function.
    await simAws.iam().putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "FunctionInvoker",
        PolicyName: "InvokePolicy",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
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
      { caller: { kind: "arn", arn: roleCreation.Role.Arn } },
    );

    // Then IAM allows the request and the handler runs.
    assertIdentical(output.StatusCode, 200);

    await simAws.backgroundTasksComplete();
  });

  it("implicitly denies a Role with no matching policy", async () => {
    // Given a function counting the times it runs.
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

    // And a Role with no Lambda permissions.
    const roleCreation = await simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: "NoPermissionsRole",
        AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Principal: { AWS: `arn:aws:iam::${accountId}:root` },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );

    // When the Role attempts to invoke the function.
    const error = await assertThrowsErrorAsync(async () =>
      simLambda.invoke(new InvokeCommand({ FunctionName: "guarded" }), {
        caller: { kind: "arn", arn: roleCreation.Role.Arn },
      }),
    );

    // Then IAM implicitly denies the request and the handler never runs.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "lambda:InvokeFunction");
    assertIdentical(invocations, 0);

    await simAws.backgroundTasksComplete();
  });
});

import {
  CreateFunctionCommand,
  CreateFunctionUrlConfigCommand,
  RemovePermissionCommand,
} from "@aws-sdk/client-lambda";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { describe, expect, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simAwsCallerHeaderName } from "../../iam/request/sim-aws-caller-header.js";
import { simIamPolicyDocumentFactory } from "../../iam/policy/sim-iam-policy-document.factory.js";
import { makeLambdaZipFileInput } from "../function/code/lambda-zip-file-input.js";
import { grantFunctionUrl } from "../../../../test/lambda/public-url-fixture.js";

const ownerAccountId = "111111111111";
const callerAccountId = "222222222222";
const callerRoleArn = `arn:aws:iam::${callerAccountId}:role/Caller`;

const reporterCode = { ZipFile: makeLambdaZipFileInput(() => ({ ok: true })) };

function localUrl(functionUrl: string): string {
  return new SimAwsLocalUrl({ input: functionUrl }).toString();
}

describe("Cross-account invocation of an AWS_IAM Function URL", () => {
  it("refuses a principal from another Account that was granted nothing", async () => {
    // Given a Function URL in one Account with no resource policy
    const simAws = new SimAws();
    const ownerLambda = simAws.account(ownerAccountId).lambda();
    await ownerLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "reporter",
        Role: `arn:aws:iam::${ownerAccountId}:role/ReporterRole`,
        Code: reporterCode,
      }),
    );
    const urlConfig = await ownerLambda.createFunctionUrlConfig(
      new CreateFunctionUrlConfigCommand({
        FunctionName: "reporter",
        AuthType: "AWS_IAM",
      }),
    );

    // When a principal from another Account calls it
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(urlConfig.FunctionUrl),
      { headers: { [simAwsCallerHeaderName]: callerRoleArn } },
    );

    // Then it is refused: neither Account allows the call
    expect(response.status).toBe(403);
  });

  it("invokes for a principal both Accounts allow", async () => {
    // Given a Function URL in one Account
    const simAws = new SimAws();
    const ownerLambda = simAws.account(ownerAccountId).lambda();
    await ownerLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "reporter",
        Role: `arn:aws:iam::${ownerAccountId}:role/ReporterRole`,
        Code: reporterCode,
      }),
    );
    const urlConfig = await ownerLambda.createFunctionUrlConfig(
      new CreateFunctionUrlConfigCommand({
        FunctionName: "reporter",
        AuthType: "AWS_IAM",
      }),
    );

    // And the other Account's Role granted permission on the function
    await grantFunctionUrl(ownerLambda, {
      FunctionName: "reporter",
      StatementId: "AllowOtherAccount",
      Principal: callerRoleArn,
    });

    // And that Role allowed to invoke Function URLs by its own Account
    const callerIam = simAws.account(callerAccountId).iam();
    await callerIam.createRole(
      new CreateRoleCommand({
        RoleName: "Caller",
        AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Principal: { AWS: `arn:aws:iam::${callerAccountId}:root` },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    await callerIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "Caller",
        PolicyName: "InvokeUrl",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Action: ["lambda:InvokeFunctionUrl", "lambda:InvokeFunction"],
            Resource: "*",
          },
        }),
      }),
    );

    // When that Role calls the URL
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(urlConfig.FunctionUrl),
      { headers: { [simAwsCallerHeaderName]: callerRoleArn } },
    );

    // Then it is admitted, which is the only way a cross-account call can be
    // allowed: an allow from each side
    expect(response.status).toBe(200);
  });

  it("refuses a principal its own Account does not allow", async () => {
    // Given a Function URL in one Account
    const simAws = new SimAws();
    const ownerLambda = simAws.account(ownerAccountId).lambda();
    await ownerLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "reporter",
        Role: `arn:aws:iam::${ownerAccountId}:role/ReporterRole`,
        Code: reporterCode,
      }),
    );
    const urlConfig = await ownerLambda.createFunctionUrlConfig(
      new CreateFunctionUrlConfigCommand({
        FunctionName: "reporter",
        AuthType: "AWS_IAM",
      }),
    );

    // And only the function's own grant to the other Account's Role
    await grantFunctionUrl(ownerLambda, {
      FunctionName: "reporter",
      StatementId: "AllowOtherAccount",
      Principal: callerRoleArn,
    });

    // When that Role calls the URL
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(urlConfig.FunctionUrl),
      { headers: { [simAwsCallerHeaderName]: callerRoleArn } },
    );

    // Then it is refused: a resource policy delegates to the caller's Account
    // rather than granting on its behalf, and nothing there allows the action
    expect(response.status).toBe(403);
  });

  it("refuses a principal the function's Account did not grant", async () => {
    // Given a Function URL in one Account
    const simAws = new SimAws();
    const ownerLambda = simAws.account(ownerAccountId).lambda();
    await ownerLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "reporter",
        Role: `arn:aws:iam::${ownerAccountId}:role/ReporterRole`,
        Code: reporterCode,
      }),
    );
    const urlConfig = await ownerLambda.createFunctionUrlConfig(
      new CreateFunctionUrlConfigCommand({
        FunctionName: "reporter",
        AuthType: "AWS_IAM",
      }),
    );

    // And a Role its own Account allows to invoke any Function URL, with no
    // grant on the function
    const callerIam = simAws.account(callerAccountId).iam();
    await callerIam.createRole(
      new CreateRoleCommand({
        RoleName: "Caller",
        AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Principal: { AWS: `arn:aws:iam::${callerAccountId}:root` },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    await callerIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "Caller",
        PolicyName: "InvokeUrl",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Action: ["lambda:InvokeFunctionUrl", "lambda:InvokeFunction"],
            Resource: "*",
          },
        }),
      }),
    );

    // When that Role calls the URL
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(urlConfig.FunctionUrl),
      { headers: { [simAwsCallerHeaderName]: callerRoleArn } },
    );

    // Then it is refused: an Account cannot grant itself access to another
    // Account's function
    expect(response.status).toBe(403);
  });

  it("refuses again once the permission is removed", async () => {
    // Given a Function URL in one Account
    const simAws = new SimAws();
    const ownerLambda = simAws.account(ownerAccountId).lambda();
    await ownerLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "reporter",
        Role: `arn:aws:iam::${ownerAccountId}:role/ReporterRole`,
        Code: reporterCode,
      }),
    );
    const urlConfig = await ownerLambda.createFunctionUrlConfig(
      new CreateFunctionUrlConfigCommand({
        FunctionName: "reporter",
        AuthType: "AWS_IAM",
      }),
    );

    // And a granted permission that is then revoked
    await grantFunctionUrl(ownerLambda, {
      FunctionName: "reporter",
      StatementId: "AllowOtherAccount",
      Principal: callerRoleArn,
    });
    await ownerLambda.removePermission(
      new RemovePermissionCommand({
        FunctionName: "reporter",
        StatementId: "AllowOtherAccount",
      }),
    );

    // And the caller's own Account still allowing the action
    const callerIam = simAws.account(callerAccountId).iam();
    await callerIam.createRole(
      new CreateRoleCommand({
        RoleName: "Caller",
        AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Principal: { AWS: `arn:aws:iam::${callerAccountId}:root` },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    await callerIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "Caller",
        PolicyName: "InvokeUrl",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Action: ["lambda:InvokeFunctionUrl", "lambda:InvokeFunction"],
            Resource: "*",
          },
        }),
      }),
    );

    // When that Role calls the URL
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(urlConfig.FunctionUrl),
      { headers: { [simAwsCallerHeaderName]: callerRoleArn } },
    );

    // Then the grant is gone with the statement
    expect(response.status).toBe(403);
  });
});

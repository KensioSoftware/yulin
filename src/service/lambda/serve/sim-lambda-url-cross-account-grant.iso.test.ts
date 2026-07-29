import {
  AddPermissionCommand,
  CreateFunctionCommand,
  CreateFunctionUrlConfigCommand,
} from "@aws-sdk/client-lambda";
import {
  CreateAccessKeyCommand,
  CreateRoleCommand,
  CreateUserCommand,
  PutRolePolicyCommand,
  PutUserPolicyCommand,
} from "@aws-sdk/client-iam";
import { describe, expect, it } from "vitest";

import { signAwsRequest } from "../../../../test/sigv4/sign-aws-request.js";
import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simAwsCallerHeaderName } from "../../iam/request/sim-aws-caller-header.js";
import { simIamPolicyDocumentFactory } from "../../iam/policy/sim-iam-policy-document.factory.js";
import { makeLambdaZipFileInput } from "../function/code/lambda-zip-file-input.js";

const ownerAccountId = "111111111111";
const callerAccountId = "222222222222";
const callerRoleArn = `arn:aws:iam::${callerAccountId}:role/Caller`;

const reporterCode = { ZipFile: makeLambdaZipFileInput(() => ({ ok: true })) };

function localUrl(functionUrl: string): string {
  return new SimAwsLocalUrl({ input: functionUrl }).toString();
}

describe("What a cross-account grant on a Function URL covers", () => {
  it("admits a signed cross-account request", async () => {
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

    // And a User in the other Account holding an access key, allowed to invoke
    // Function URLs by its own Account
    const callerIam = simAws.account(callerAccountId).iam();
    await callerIam.createUser(new CreateUserCommand({ UserName: "Caller" }));
    await callerIam.putUserPolicy(
      new PutUserPolicyCommand({
        UserName: "Caller",
        PolicyName: "InvokeUrl",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: { Action: "lambda:InvokeFunctionUrl", Resource: "*" },
        }),
      }),
    );
    const key = await callerIam.createAccessKey(
      new CreateAccessKeyCommand({ UserName: "Caller" }),
    );

    // And the function granting that User the URL
    await ownerLambda.addPermission(
      new AddPermissionCommand({
        FunctionName: "reporter",
        StatementId: "AllowOtherAccountUser",
        Action: "lambda:InvokeFunctionUrl",
        Principal: `arn:aws:iam::${callerAccountId}:user/Caller`,
        FunctionUrlAuthType: "AWS_IAM",
      }),
    );

    // When they sign a request to the URL
    const signed = await signAwsRequest({
      url: localUrl(urlConfig.FunctionUrl),
      credentials: {
        accessKeyId: key.AccessKey.AccessKeyId,
        secretAccessKey: key.AccessKey.SecretAccessKey,
      },
    });
    const response = await new SimAwsHttp({ simAws }).handleRequest(
      signed.request,
    );

    // Then the signature identifies them and both Accounts admit them
    expect(response.status).toBe(200);
  });

  it("does not let an Invoke grant open the Function URL", async () => {
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

    // And the other Account's Role allowed to invoke Function URLs by its own
    // Account
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
          Statement: { Action: "lambda:InvokeFunctionUrl", Resource: "*" },
        }),
      }),
    );

    // And a grant to it of only the Invoke API action
    await ownerLambda.addPermission(
      new AddPermissionCommand({
        FunctionName: "reporter",
        StatementId: "AllowInvoke",
        Action: "lambda:InvokeFunction",
        Principal: callerRoleArn,
      }),
    );

    // When that Role calls the URL
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(urlConfig.FunctionUrl),
      { headers: { [simAwsCallerHeaderName]: callerRoleArn } },
    );

    // Then the grant does not carry across: real AWS keeps the two actions
    // separate so a policy can grant one without the other
    expect(response.status).toBe(403);
  });

  it("honours a FunctionUrlAuthType condition on the grant", async () => {
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

    // And a grant conditioned on the URL being public, not IAM-authenticated
    await ownerLambda.addPermission(
      new AddPermissionCommand({
        FunctionName: "reporter",
        StatementId: "AllowOtherAccount",
        Action: "lambda:InvokeFunctionUrl",
        Principal: callerRoleArn,
        FunctionUrlAuthType: "NONE",
      }),
    );

    // And the other Account's Role allowed to invoke Function URLs by its own
    // Account
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
          Statement: { Action: "lambda:InvokeFunctionUrl", Resource: "*" },
        }),
      }),
    );

    // When the Role calls the AWS_IAM URL
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(urlConfig.FunctionUrl),
      { headers: { [simAwsCallerHeaderName]: callerRoleArn } },
    );

    // Then the condition does not hold, so the grant does not apply: a
    // permission for one auth type must not open a URL configured for another
    expect(response.status).toBe(403);
  });

  it("applies a grant whose FunctionUrlAuthType condition matches", async () => {
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

    // And a grant conditioned on the auth type the URL actually has
    await ownerLambda.addPermission(
      new AddPermissionCommand({
        FunctionName: "reporter",
        StatementId: "AllowOtherAccount",
        Action: "lambda:InvokeFunctionUrl",
        Principal: callerRoleArn,
        FunctionUrlAuthType: "AWS_IAM",
      }),
    );

    // And the other Account's Role allowed to invoke Function URLs by its own
    // Account
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
          Statement: { Action: "lambda:InvokeFunctionUrl", Resource: "*" },
        }),
      }),
    );

    // When the Role calls the URL
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(urlConfig.FunctionUrl),
      { headers: { [simAwsCallerHeaderName]: callerRoleArn } },
    );

    // Then the condition holds and the grant applies
    expect(response.status).toBe(200);
  });
});

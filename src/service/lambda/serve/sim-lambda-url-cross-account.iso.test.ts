import {
  AddPermissionCommand,
  CreateFunctionCommand,
  CreateFunctionUrlConfigCommand,
  RemovePermissionCommand,
} from "@aws-sdk/client-lambda";
import {
  CreateAccessKeyCommand,
  CreateUserCommand,
  PutUserPolicyCommand,
} from "@aws-sdk/client-iam";
import { describe, expect, it } from "vitest";

import { signAwsRequest } from "../../../../test/sigv4/sign-aws-request.js";
import type { SignAwsRequestCredentials } from "../../../../test/sigv4/sign-aws-request.js";
import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simAwsCallerHeaderName } from "../../iam/request/sim-aws-caller-header.js";
import { makeLambdaZipFileInput } from "../function/code/lambda-zip-file-input.js";

const ownerAccountId = "111111111111";
const callerAccountId = "222222222222";
const callerRoleArn = `arn:aws:iam::${callerAccountId}:role/Caller`;

interface CrossAccountFunction {
  readonly simAws: SimAws;
  readonly url: string;
}

/**
 * A function with an AWS_IAM Function URL in one Account, in a simulation that
 * also has a second Account for the caller to belong to.
 */
async function serveOwnedFunction(): Promise<CrossAccountFunction> {
  const simAws = new SimAws();
  const lambda = simAws.account(ownerAccountId).lambda();

  await lambda.createFunction(
    new CreateFunctionCommand({
      FunctionName: "reporter",
      Role: `arn:aws:iam::${ownerAccountId}:role/ReporterRole`,
      Code: { ZipFile: makeLambdaZipFileInput(() => ({ ok: true })) },
    }),
  );

  const urlConfig = await lambda.createFunctionUrlConfig(
    new CreateFunctionUrlConfigCommand({
      FunctionName: "reporter",
      AuthType: "AWS_IAM",
    }),
  );

  return {
    simAws,
    url: new SimAwsLocalUrl({ input: urlConfig.FunctionUrl }).toString(),
  };
}

/**
 * Grant the other Account's caller permission to invoke the Function URL.
 */
async function grantInvokeUrl(
  simAws: SimAws,
  functionUrlAuthType?: "AWS_IAM" | "NONE",
): Promise<void> {
  await simAws
    .account(ownerAccountId)
    .lambda()
    .addPermission(
      new AddPermissionCommand({
        FunctionName: "reporter",
        StatementId: "AllowOtherAccount",
        Action: "lambda:InvokeFunctionUrl",
        Principal: callerRoleArn,
        ...(functionUrlAuthType !== undefined && {
          FunctionUrlAuthType: functionUrlAuthType,
        }),
      }),
    );
}

/**
 * A signing User in the caller's own Account, allowed to invoke the URL by
 * that Account's own identity policy.
 */
async function callerAccountUser(
  simAws: SimAws,
): Promise<SignAwsRequestCredentials> {
  const iam = simAws.account(callerAccountId).iam();

  await iam.createUser(new CreateUserCommand({ UserName: "Caller" }));
  await iam.putUserPolicy(
    new PutUserPolicyCommand({
      UserName: "Caller",
      PolicyName: "InvokeUrl",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Action: "lambda:InvokeFunctionUrl",
          Resource: "*",
        },
      }),
    }),
  );

  const key = await iam.createAccessKey(
    new CreateAccessKeyCommand({ UserName: "Caller" }),
  );

  return {
    accessKeyId: key.AccessKey.AccessKeyId,
    secretAccessKey: key.AccessKey.SecretAccessKey,
  };
}

describe("Cross-account invocation of an AWS_IAM Function URL", () => {
  it("refuses a principal from another Account that was granted nothing", async () => {
    // Given a Function URL in one Account with no resource policy
    const { simAws, url } = await serveOwnedFunction();

    // When a principal from another Account calls it
    const response = await new SimAwsHttp({ simAws }).fetch(url, {
      headers: { [simAwsCallerHeaderName]: callerRoleArn },
    });

    // Then it is refused: the owning Account has no policies for a principal
    // it did not create, so nothing can allow the call
    expect(response.status).toBe(403);
  });

  it("invokes for a principal from another Account that was granted the URL", async () => {
    // Given the other Account's Role granted permission on the function
    const { simAws, url } = await serveOwnedFunction();
    await grantInvokeUrl(simAws);

    // When that Role calls the URL
    const response = await new SimAwsHttp({ simAws }).fetch(url, {
      headers: { [simAwsCallerHeaderName]: callerRoleArn },
    });

    // Then the resource policy is what admits it, which is the only way a
    // cross-account call can be allowed at all
    expect(response.status).toBe(200);
  });

  it("refuses again once the permission is removed", async () => {
    // Given a granted permission that is then revoked
    const { simAws, url } = await serveOwnedFunction();
    await grantInvokeUrl(simAws);
    await simAws
      .account(ownerAccountId)
      .lambda()
      .removePermission(
        new RemovePermissionCommand({
          FunctionName: "reporter",
          StatementId: "AllowOtherAccount",
        }),
      );

    // When that Role calls the URL
    const response = await new SimAwsHttp({ simAws }).fetch(url, {
      headers: { [simAwsCallerHeaderName]: callerRoleArn },
    });

    // Then the grant is gone with the statement
    expect(response.status).toBe(403);
  });

  it("admits a signed cross-account request", async () => {
    // Given a User in the other Account holding an access key, granted the URL
    const { simAws, url } = await serveOwnedFunction();
    const credentials = await callerAccountUser(simAws);
    await simAws
      .account(ownerAccountId)
      .lambda()
      .addPermission(
        new AddPermissionCommand({
          FunctionName: "reporter",
          StatementId: "AllowOtherAccountUser",
          Action: "lambda:InvokeFunctionUrl",
          Principal: `arn:aws:iam::${callerAccountId}:user/Caller`,
          FunctionUrlAuthType: "AWS_IAM",
        }),
      );

    // When they sign a request to the URL
    const signed = await signAwsRequest({ url, credentials });
    const response = await new SimAwsHttp({ simAws }).handleRequest(
      signed.request,
    );

    // Then the signature identifies them and the resource policy admits them
    expect(response.status).toBe(200);
  });

  it("does not let an Invoke grant open the Function URL", async () => {
    // Given the other Account's Role granted only the Invoke API action
    const { simAws, url } = await serveOwnedFunction();
    await simAws
      .account(ownerAccountId)
      .lambda()
      .addPermission(
        new AddPermissionCommand({
          FunctionName: "reporter",
          StatementId: "AllowInvoke",
          Action: "lambda:InvokeFunction",
          Principal: callerRoleArn,
        }),
      );

    // When that Role calls the URL
    const response = await new SimAwsHttp({ simAws }).fetch(url, {
      headers: { [simAwsCallerHeaderName]: callerRoleArn },
    });

    // Then the grant does not carry across: real AWS keeps the two actions
    // separate so a policy can grant one without the other
    expect(response.status).toBe(403);
  });

  it("honours a FunctionUrlAuthType condition on the grant", async () => {
    // Given a grant conditioned on the URL being public, not IAM-authenticated
    const { simAws, url } = await serveOwnedFunction();
    await grantInvokeUrl(simAws, "NONE");

    // When the Role calls the AWS_IAM URL
    const response = await new SimAwsHttp({ simAws }).fetch(url, {
      headers: { [simAwsCallerHeaderName]: callerRoleArn },
    });

    // Then the condition does not hold, so the grant does not apply: a
    // permission for one auth type must not open a URL configured for another
    expect(response.status).toBe(403);
  });

  it("applies a grant whose FunctionUrlAuthType condition matches", async () => {
    // Given the same grant, conditioned on the auth type the URL actually has
    const { simAws, url } = await serveOwnedFunction();
    await grantInvokeUrl(simAws, "AWS_IAM");

    // When the Role calls the URL
    const response = await new SimAwsHttp({ simAws }).fetch(url, {
      headers: { [simAwsCallerHeaderName]: callerRoleArn },
    });

    // Then the condition holds and the grant applies
    expect(response.status).toBe(200);
  });
});

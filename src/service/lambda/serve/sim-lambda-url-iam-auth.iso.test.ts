import {
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
import { AssumeRoleCommand } from "@aws-sdk/client-sts";
import { describe, expect, it } from "vitest";

import { signAwsRequest } from "../../../../test/sigv4/sign-aws-request.js";
import type { SignAwsRequestCredentials } from "../../../../test/sigv4/sign-aws-request.js";
import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import { simAwsCallerHeaderName } from "../../iam/request/sim-aws-caller-header.js";
import { SimAws } from "../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../function/code/lambda-zip-file-input.js";
import type {
  SimLambdaFunctionUrlEvent,
  SimLambdaFunctionUrlRequestContext,
} from "./event/sim-lambda-url-event.type.js";

const accountId = "888888888888";

interface IamProtectedFunction {
  readonly simAws: SimAws;
  readonly url: string;
  readonly functionArn: string;
}

/**
 * A function behind an AWS_IAM Function URL, whose handler echoes the IAM
 * caller the invocation event describes.
 */
async function serveIamFunction(
  authType: "AWS_IAM" | "NONE" = "AWS_IAM",
): Promise<IamProtectedFunction> {
  const simAws = new SimAws();

  const created = await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: "reporter",
      Role: `arn:aws:iam::${accountId}:role/ReporterRole`,
      Code: {
        ZipFile: makeLambdaZipFileInput(
          (event: SimLambdaFunctionUrlEvent) => event.requestContext,
        ),
      },
    }),
  );

  const urlConfig = await simAws.lambda().createFunctionUrlConfig(
    new CreateFunctionUrlConfigCommand({
      FunctionName: "reporter",
      AuthType: authType,
    }),
  );

  return {
    simAws,
    url: new SimAwsLocalUrl({ input: urlConfig.FunctionUrl }).toString(),
    functionArn: created.FunctionArn,
  };
}

/**
 * Give the simulation a User holding an access key, with one inline policy
 * statement, and return credentials that can sign as them.
 */
async function signingUser(
  simAws: SimAws,
  statement: Record<string, unknown>,
): Promise<SignAwsRequestCredentials> {
  const iam = simAws.iam();

  await iam.createUser(new CreateUserCommand({ UserName: "Invoker" }));
  await iam.putUserPolicy(
    new PutUserPolicyCommand({
      UserName: "Invoker",
      PolicyName: "InvokePolicy",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: statement,
      }),
    }),
  );

  const key = await iam.createAccessKey(
    new CreateAccessKeyCommand({ UserName: "Invoker" }),
  );

  return {
    accessKeyId: key.AccessKey.AccessKeyId,
    secretAccessKey: key.AccessKey.SecretAccessKey,
  };
}

describe("Invoking an AWS_IAM Lambda Function URL", () => {
  it("invokes for a signed caller allowed to invoke the Function URL", async () => {
    // Given a User whose policy allows invoking this function's URL
    const { simAws, url, functionArn } = await serveIamFunction();
    const credentials = await signingUser(simAws, {
      Effect: "Allow",
      Action: "lambda:InvokeFunctionUrl",
      Resource: functionArn,
    });

    // When they sign a request to the URL and it is served
    const signed = await signAwsRequest({ url, credentials });
    const response = await new SimAwsHttp({ simAws }).handleRequest(
      signed.request,
    );

    // Then the function runs, which is what the auth type has never been able
    // to do before
    expect(response.status).toBe(200);
  });

  it("refuses a signed caller without the invoke permission", async () => {
    // Given a User whose policy grants something else entirely
    const { simAws, url } = await serveIamFunction();
    const credentials = await signingUser(simAws, {
      Effect: "Allow",
      Action: "s3:GetObject",
      Resource: "*",
    });

    // When they sign a request to the URL and it is served
    const signed = await signAwsRequest({ url, credentials });
    const response = await new SimAwsHttp({ simAws }).handleRequest(
      signed.request,
    );

    // Then a sound signature is not enough: the request is authenticated but
    // not authorized
    expect(response.status).toBe(403);
    expect(await response.json()).toStrictEqual({ Message: "Forbidden" });
  });

  it("does not accept lambda:InvokeFunction as permission for the URL", async () => {
    // Given a User allowed the Invoke API action rather than the URL one
    const { simAws, url, functionArn } = await serveIamFunction();
    const credentials = await signingUser(simAws, {
      Effect: "Allow",
      Action: "lambda:InvokeFunction",
      Resource: functionArn,
    });

    // When they sign a request to the URL and it is served
    const signed = await signAwsRequest({ url, credentials });
    const response = await new SimAwsHttp({ simAws }).handleRequest(
      signed.request,
    );

    // Then it is refused, as real AWS separates the two actions so a policy
    // can grant the SDK operation without granting the HTTP endpoint
    expect(response.status).toBe(403);
  });

  it("authorizes a request as the principal its caller header names", async () => {
    // Given a Role named directly rather than signed for, allowed to invoke
    const { simAws, url, functionArn } = await serveIamFunction();
    const roleArn = `arn:aws:iam::${accountId}:role/Reporter`;
    await simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: "Reporter",
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
    await simAws.iam().putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "Reporter",
        PolicyName: "InvokeUrl",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "lambda:InvokeFunctionUrl",
            Resource: functionArn,
          },
        }),
      }),
    );

    // When the URL is requested naming that Role
    const response = await new SimAwsHttp({ simAws }).fetch(url, {
      headers: { [simAwsCallerHeaderName]: roleArn },
    });

    // Then the convenience path authorizes exactly as a signature would, so a
    // curl one-liner can exercise an IAM-protected endpoint
    expect(response.status).toBe(200);
  });

  it("authorizes an assumed-role session against the Role behind it", async () => {
    // Given a Role allowed to invoke, and a session assumed from it
    const { simAws, url, functionArn } = await serveIamFunction();
    await simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: "Deployer",
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
    await simAws.iam().putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "Deployer",
        PolicyName: "InvokeUrl",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "lambda:InvokeFunctionUrl",
            Resource: functionArn,
          },
        }),
      }),
    );
    const assumed = await simAws.sts().assumeRole(
      new AssumeRoleCommand({
        RoleArn: `arn:aws:iam::${accountId}:role/Deployer`,
        RoleSessionName: "deploy-session",
      }),
    );

    // When the session's temporary credentials sign a request to the URL
    const signed = await signAwsRequest({
      url,
      credentials: {
        accessKeyId: assumed.Credentials?.AccessKeyId ?? "",
        secretAccessKey: assumed.Credentials?.SecretAccessKey ?? "",
        sessionToken: assumed.Credentials?.SessionToken ?? "",
      },
    });
    const response = await new SimAwsHttp({ simAws }).handleRequest(
      signed.request,
    );

    // Then it is allowed: the session ARN owns no policies of its own, so the
    // permission has to come from the Role it was assumed from
    expect(response.status).toBe(200);
    const context =
      (await response.json()) as SimLambdaFunctionUrlRequestContext;
    expect(context.authorizer?.iam.userArn).toBe(
      `arn:aws:sts::${accountId}:assumed-role/Deployer/deploy-session`,
    );
  });
});

describe("The IAM caller in a Function URL invocation event", () => {
  it("describes the caller of an AWS_IAM invocation", async () => {
    // Given a signed, permitted invocation of an AWS_IAM Function URL
    const { simAws, url, functionArn } = await serveIamFunction();
    const credentials = await signingUser(simAws, {
      Effect: "Allow",
      Action: "lambda:InvokeFunctionUrl",
      Resource: functionArn,
    });
    const signed = await signAwsRequest({ url, credentials });

    // When the handler reads its invocation event
    const response = await new SimAwsHttp({ simAws }).handleRequest(
      signed.request,
    );
    const context =
      (await response.json()) as SimLambdaFunctionUrlRequestContext;

    // Then it can tell who called it and from which Account, which is the
    // point of the auth type for handler code
    expect(context.authorizer?.iam.userArn).toBe(
      `arn:aws:iam::${accountId}:user/Invoker`,
    );
    expect(context.authorizer?.iam.accountId).toBe(accountId);
    expect(context.accountId).toBe(accountId);
  });

  it("describes no caller for a NONE invocation", async () => {
    // Given a Function URL anyone may invoke
    const { simAws, url } = await serveIamFunction("NONE");

    // When the handler reads its invocation event
    const response = await new SimAwsHttp({ simAws }).fetch(url);
    const context =
      (await response.json()) as SimLambdaFunctionUrlRequestContext;

    // Then there is no caller to describe, as on real AWS, and the Account is
    // reported as anonymous
    expect(context.authorizer).toBeUndefined();
    expect(context.accountId).toBe("anonymous");
  });
});

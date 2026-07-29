import {
  CreateFunctionCommand,
  CreateFunctionUrlConfigCommand,
} from "@aws-sdk/client-lambda";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { AssumeRoleCommand } from "@aws-sdk/client-sts";
import { assertNonNullable } from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { signAwsRequest } from "../../../../test/sigv4/sign-aws-request.js";
import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import { simAwsCallerHeaderName } from "../../iam/request/sim-aws-caller-header.js";
import { simIamPolicyDocumentFactory } from "../../iam/policy/sim-iam-policy-document.factory.js";
import { SimAws } from "../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../function/code/lambda-zip-file-input.js";
import type {
  SimLambdaFunctionUrlEvent,
  SimLambdaFunctionUrlRequestContext,
} from "./event/sim-lambda-url-event.type.js";

const accountId = "888888888888";

/**
 * Function code echoing the IAM caller its invocation event describes.
 */
const reportCallerCode = {
  ZipFile: makeLambdaZipFileInput(
    (event: SimLambdaFunctionUrlEvent) => event.requestContext,
  ),
};

function localUrl(functionUrl: string): string {
  return new SimAwsLocalUrl({ input: functionUrl }).toString();
}

describe("Invoking an AWS_IAM Lambda Function URL as a Role", () => {
  it("authorizes a request as the principal its caller header names", async () => {
    // Given a function behind an AWS_IAM Function URL
    const simAws = new SimAws();
    const reporter = await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "reporter",
        Role: `arn:aws:iam::${accountId}:role/ReporterRole`,
        Code: reportCallerCode,
      }),
    );
    const urlConfig = await simAws.lambda().createFunctionUrlConfig(
      new CreateFunctionUrlConfigCommand({
        FunctionName: "reporter",
        AuthType: "AWS_IAM",
      }),
    );

    // And a Role named directly rather than signed for, allowed to invoke
    const roleCreation = await simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: "Reporter",
        AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
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
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Action: "lambda:InvokeFunctionUrl",
            Resource: reporter.FunctionArn,
          },
        }),
      }),
    );

    // When the URL is requested naming that Role
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(urlConfig.FunctionUrl),
      { headers: { [simAwsCallerHeaderName]: roleCreation.Role.Arn } },
    );

    // Then the convenience path authorizes exactly as a signature would, so a
    // curl one-liner can exercise an IAM-protected endpoint
    expect(response.status).toBe(200);
  });

  it("authorizes an assumed-role session against the Role behind it", async () => {
    // Given a function behind an AWS_IAM Function URL
    const simAws = new SimAws();
    const reporter = await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "reporter",
        Role: `arn:aws:iam::${accountId}:role/ReporterRole`,
        Code: reportCallerCode,
      }),
    );
    const urlConfig = await simAws.lambda().createFunctionUrlConfig(
      new CreateFunctionUrlConfigCommand({
        FunctionName: "reporter",
        AuthType: "AWS_IAM",
      }),
    );

    // And a Role allowed to invoke it
    await simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: "Deployer",
        AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
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
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Action: "lambda:InvokeFunctionUrl",
            Resource: reporter.FunctionArn,
          },
        }),
      }),
    );

    // And a session assumed from that Role
    const assumed = await simAws.sts().assumeRole(
      new AssumeRoleCommand({
        RoleArn: `arn:aws:iam::${accountId}:role/Deployer`,
        RoleSessionName: "deploy-session",
      }),
    );

    // When the session's temporary credentials sign a request to the URL
    const credentials = assumed.Credentials;
    assertNonNullable(credentials);
    assertNonNullable(credentials.AccessKeyId);
    assertNonNullable(credentials.SecretAccessKey);
    assertNonNullable(credentials.SessionToken);

    const signed = await signAwsRequest({
      url: localUrl(urlConfig.FunctionUrl),
      credentials: {
        accessKeyId: credentials.AccessKeyId,
        secretAccessKey: credentials.SecretAccessKey,
        sessionToken: credentials.SessionToken,
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

import {
  AddPermissionCommand,
  CreateFunctionCommand,
  CreateFunctionUrlConfigCommand,
  type FunctionUrlAuthType,
} from "@aws-sdk/client-lambda";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  assertIdentical,
  assertResponseStatus,
  describeResponse,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simAwsCallerHeaderName } from "../../iam/request/sim-aws-caller-header.js";
import { simIamPolicyDocumentFactory } from "../../iam/policy/sim-iam-policy-document.factory.js";
import { makeLambdaZipFileInput } from "../function/code/lambda-zip-file-input.js";
import { grantPublicFunctionUrl } from "../../../../test/lambda/public-url-fixture.js";

const accountId = "888888888888";
const callerRoleArn = `arn:aws:iam::${accountId}:role/Caller`;

/**
 * A function behind a Function URL of the given auth type, answering with a
 * fixed body, and the local URL that reaches it.
 */
async function greeterUrl(
  simAws: SimAws,
  authType: FunctionUrlAuthType,
): Promise<string> {
  await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: "greeter",
      Role: `arn:aws:iam::${accountId}:role/GreeterRole`,
      Code: { ZipFile: makeLambdaZipFileInput(() => "hello") },
    }),
  );
  const { FunctionUrl } = await simAws.lambda().createFunctionUrlConfig(
    new CreateFunctionUrlConfigCommand({
      FunctionName: "greeter",
      AuthType: authType,
    }),
  );

  return new SimAwsLocalUrl({ input: FunctionUrl }).toString();
}

/**
 * A Role in the function's Account whose identity policy allows the given
 * actions on every resource.
 */
async function callerRoleAllowed(
  simAws: SimAws,
  actions: string[],
): Promise<void> {
  await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: "Caller",
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
      RoleName: "Caller",
      PolicyName: "InvokeUrl",
      PolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: { Action: actions, Resource: "*" },
      }),
    }),
  );
}

describe("The two actions a sim Lambda Function URL takes", () => {
  it("refuses a NONE URL whose function grants nothing", async () => {
    // Given a public Function URL created through the API, which writes no
    // permission of its own.
    const simAws = new SimAws();
    const url = await greeterUrl(simAws, "NONE");

    // When it is requested.
    const response = await new SimAwsHttp({ simAws }).fetch(url);

    // Then it answers 403, as real Lambda does for a URL open to no one.
    assertResponseStatus(response, 403, await describeResponse(response));
  });

  it("refuses a NONE URL granted only lambda:InvokeFunctionUrl", async () => {
    // Given a public Function URL whose function grants everyone the URL
    // action, the one statement such a URL used to need.
    const simAws = new SimAws();
    const url = await greeterUrl(simAws, "NONE");
    await simAws.lambda().addPermission(
      new AddPermissionCommand({
        FunctionName: "greeter",
        StatementId: "FunctionURLAllowPublicAccess",
        Action: "lambda:InvokeFunctionUrl",
        Principal: "*",
        FunctionUrlAuthType: "NONE",
      }),
    );

    // When it is requested.
    const response = await new SimAwsHttp({ simAws }).fetch(url);

    // Then lambda:InvokeFunction is missing, so the request is refused.
    assertResponseStatus(response, 403, await describeResponse(response));
  });

  it("serves a NONE URL granted both actions", async () => {
    // Given a public Function URL granted both actions, the second only for
    // calls through a URL.
    const simAws = new SimAws();
    const url = await greeterUrl(simAws, "NONE");
    await grantPublicFunctionUrl(simAws.lambda(), "greeter");

    // When it is requested.
    const response = await new SimAwsHttp({ simAws }).fetch(url);

    // Then the function answers.
    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.text(), '"hello"');
  });

  it("judges a request to a NONE URL as anonymous whoever it names", async () => {
    // Given a public Function URL granted nothing, and a Role whose own
    // policy allows both actions.
    const simAws = new SimAws();
    const url = await greeterUrl(simAws, "NONE");
    await callerRoleAllowed(simAws, [
      "lambda:InvokeFunctionUrl",
      "lambda:InvokeFunction",
    ]);

    // When the URL is requested naming that Role.
    const response = await new SimAwsHttp({ simAws }).fetch(url, {
      headers: { [simAwsCallerHeaderName]: callerRoleArn },
    });

    // Then the Role's policy counts for nothing: a NONE URL authenticates no
    // one, so only a grant to everyone opens it.
    assertResponseStatus(response, 403, await describeResponse(response));
  });

  it("refuses an AWS_IAM caller allowed only lambda:InvokeFunctionUrl", async () => {
    // Given an IAM-authenticated Function URL, and a Role in the same Account
    // allowed the URL action and nothing else.
    const simAws = new SimAws();
    const url = await greeterUrl(simAws, "AWS_IAM");
    await callerRoleAllowed(simAws, ["lambda:InvokeFunctionUrl"]);

    // When that Role requests the URL.
    const response = await new SimAwsHttp({ simAws }).fetch(url, {
      headers: { [simAwsCallerHeaderName]: callerRoleArn },
    });

    // Then it is refused for want of lambda:InvokeFunction.
    assertResponseStatus(response, 403, await describeResponse(response));
  });

  it("serves an AWS_IAM caller allowed both actions", async () => {
    // Given an IAM-authenticated Function URL, and a Role allowed both
    // actions by its identity policy.
    const simAws = new SimAws();
    const url = await greeterUrl(simAws, "AWS_IAM");
    await callerRoleAllowed(simAws, [
      "lambda:InvokeFunctionUrl",
      "lambda:InvokeFunction",
    ]);

    // When that Role requests the URL.
    const response = await new SimAwsHttp({ simAws }).fetch(url, {
      headers: { [simAwsCallerHeaderName]: callerRoleArn },
    });

    // Then the function answers.
    assertResponseStatus(response, 200, await describeResponse(response));
  });
});

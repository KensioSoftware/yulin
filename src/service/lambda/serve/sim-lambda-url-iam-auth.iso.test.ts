import {
  CreateFunctionCommand,
  CreateFunctionUrlConfigCommand,
} from "@aws-sdk/client-lambda";
import {
  CreateAccessKeyCommand,
  CreateUserCommand,
  PutUserPolicyCommand,
} from "@aws-sdk/client-iam";
import { describe, expect, it } from "vitest";

import { signAwsRequest } from "../../../../test/sigv4/sign-aws-request.js";
import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import { simIamPolicyDocumentFactory } from "../../iam/policy/sim-iam-policy-document.factory.js";
import { SimAws } from "../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../function/code/lambda-zip-file-input.js";
import { simLambdaUrlForbiddenMessage } from "./response/sim-lambda-url-error-response.js";
import type { SimPayload2RequestContext } from "../../../serve/payload-2/sim-payload-2-event.type.js";
import type { SimLambdaFunctionUrlEvent } from "./event/sim-lambda-url-event.type.js";

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

describe("Invoking an AWS_IAM Lambda Function URL as a signed caller", () => {
  it("invokes for a signed caller allowed to invoke the Function URL", async () => {
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

    // And a User whose policy allows invoking this function's URL
    await simAws
      .iam()
      .createUser(new CreateUserCommand({ UserName: "Invoker" }));
    await simAws.iam().putUserPolicy(
      new PutUserPolicyCommand({
        UserName: "Invoker",
        PolicyName: "InvokePolicy",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Action: "lambda:InvokeFunctionUrl",
            Resource: reporter.FunctionArn,
          },
        }),
      }),
    );
    const key = await simAws
      .iam()
      .createAccessKey(new CreateAccessKeyCommand({ UserName: "Invoker" }));

    // When they sign a request to the URL and it is served
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

    // Then the function runs, which is what the auth type has never been able
    // to do before
    expect(response.status).toBe(200);
  });

  it("refuses a signed caller without the invoke permission", async () => {
    // Given a function behind an AWS_IAM Function URL
    const simAws = new SimAws();
    await simAws.lambda().createFunction(
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

    // And a User whose policy grants something else entirely
    await simAws
      .iam()
      .createUser(new CreateUserCommand({ UserName: "Invoker" }));
    await simAws.iam().putUserPolicy(
      new PutUserPolicyCommand({
        UserName: "Invoker",
        PolicyName: "InvokePolicy",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: { Action: "s3:GetObject", Resource: "*" },
        }),
      }),
    );
    const key = await simAws
      .iam()
      .createAccessKey(new CreateAccessKeyCommand({ UserName: "Invoker" }));

    // When they sign a request to the URL and it is served
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

    // Then a sound signature is not enough: the request is authenticated but
    // not authorized
    expect(response.status).toBe(403);
    expect(await response.json()).toStrictEqual({
      Message: simLambdaUrlForbiddenMessage,
    });
  });

  it("does not accept lambda:InvokeFunction as permission for the URL", async () => {
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

    // And a User allowed the Invoke API action rather than the URL one
    await simAws
      .iam()
      .createUser(new CreateUserCommand({ UserName: "Invoker" }));
    await simAws.iam().putUserPolicy(
      new PutUserPolicyCommand({
        UserName: "Invoker",
        PolicyName: "InvokePolicy",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Action: "lambda:InvokeFunction",
            Resource: reporter.FunctionArn,
          },
        }),
      }),
    );
    const key = await simAws
      .iam()
      .createAccessKey(new CreateAccessKeyCommand({ UserName: "Invoker" }));

    // When they sign a request to the URL and it is served
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

    // Then it is refused, as real AWS separates the two actions so a policy
    // can grant the SDK operation without granting the HTTP endpoint
    expect(response.status).toBe(403);
  });

  it("describes the caller of an AWS_IAM invocation in the event", async () => {
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

    // And a signed, permitted invocation by a User
    await simAws
      .iam()
      .createUser(new CreateUserCommand({ UserName: "Invoker" }));
    await simAws.iam().putUserPolicy(
      new PutUserPolicyCommand({
        UserName: "Invoker",
        PolicyName: "InvokePolicy",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Action: "lambda:InvokeFunctionUrl",
            Resource: reporter.FunctionArn,
          },
        }),
      }),
    );
    const key = await simAws
      .iam()
      .createAccessKey(new CreateAccessKeyCommand({ UserName: "Invoker" }));
    const signed = await signAwsRequest({
      url: localUrl(urlConfig.FunctionUrl),
      credentials: {
        accessKeyId: key.AccessKey.AccessKeyId,
        secretAccessKey: key.AccessKey.SecretAccessKey,
      },
    });

    // When the handler reads its invocation event
    const response = await new SimAwsHttp({ simAws }).handleRequest(
      signed.request,
    );
    const context = (await response.json()) as SimPayload2RequestContext;

    // Then it can tell who called it and from which Account, which is the
    // point of the auth type for handler code
    expect(context.authorizer?.iam?.userArn).toBe(
      `arn:aws:iam::${accountId}:user/Invoker`,
    );
    expect(context.authorizer?.iam?.accountId).toBe(accountId);
    expect(context.accountId).toBe(accountId);
  });

  it("describes no caller for a NONE invocation", async () => {
    // Given a Function URL anyone may invoke
    const simAws = new SimAws();
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "reporter",
        Role: `arn:aws:iam::${accountId}:role/ReporterRole`,
        Code: reportCallerCode,
      }),
    );
    const urlConfig = await simAws.lambda().createFunctionUrlConfig(
      new CreateFunctionUrlConfigCommand({
        FunctionName: "reporter",
        AuthType: "NONE",
      }),
    );

    // When the handler reads its invocation event
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(urlConfig.FunctionUrl),
    );
    const context = (await response.json()) as SimPayload2RequestContext;

    // Then there is no caller to describe, as on real AWS, and the Account is
    // reported as anonymous
    expect(context.authorizer).toBeUndefined();
    expect(context.accountId).toBe("anonymous");
  });
});

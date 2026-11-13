import {
  CreateFunctionCommand,
  CreateFunctionUrlConfigCommand,
  TagResourceCommand,
} from "@aws-sdk/client-lambda";
import {
  CreateAccessKeyCommand,
  CreateUserCommand,
  PutUserPolicyCommand,
} from "@aws-sdk/client-iam";
import { assertResponseStatus, describeResponse } from "@kensio/smartass";
import { describe, it } from "vitest";

import { signAwsRequest } from "../../../../test/sigv4/sign-aws-request.js";
import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simIamPolicyDocumentFactory } from "../../iam/policy/sim-iam-policy-document.factory.js";
import { makeLambdaZipFileInput } from "../function/code/lambda-zip-file-input.js";

describe("a Function URL call decided on the function's tags", () => {
  it("admits a caller whose policy names the function's tag, until the tag changes", async () => {
    // Given an AWS_IAM Function URL on a function tagged for one team.
    const simAws = new SimAws();
    const lambda = simAws.lambda();
    const { FunctionArn } = await lambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "orders",
        Role: `arn:aws:iam::${simAws.defaultAccountId}:role/OrdersRole`,
        Code: { ZipFile: makeLambdaZipFileInput(() => ({ ok: true })) },
        Tags: { team: "orders" },
      }),
    );
    const { FunctionUrl } = await lambda.createFunctionUrlConfig(
      new CreateFunctionUrlConfigCommand({
        FunctionName: "orders",
        AuthType: "AWS_IAM",
      }),
    );

    // And a User allowed both Function URL actions on that team's functions.
    const iam = simAws.iam();
    await iam.createUser(new CreateUserCommand({ UserName: "Caller" }));
    await iam.putUserPolicy(
      new PutUserPolicyCommand({
        UserName: "Caller",
        PolicyName: "InvokeTeamUrls",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Action: ["lambda:InvokeFunctionUrl", "lambda:InvokeFunction"],
            Resource: "*",
            Condition: { StringEquals: { "aws:ResourceTag/team": "orders" } },
          },
        }),
      }),
    );
    const { AccessKey } = await iam.createAccessKey(
      new CreateAccessKeyCommand({ UserName: "Caller" }),
    );
    const call = async (): Promise<Response> => {
      const signed = await signAwsRequest({
        url: new SimAwsLocalUrl({ input: FunctionUrl }).toString(),
        credentials: {
          accessKeyId: AccessKey.AccessKeyId,
          secretAccessKey: AccessKey.SecretAccessKey,
        },
      });

      return await new SimAwsHttp({ simAws }).handleRequest(signed.request);
    };

    // When the User calls the URL, and again once the function is retagged.
    const admitted = await call();
    await lambda.tagResource(
      new TagResourceCommand({
        Resource: FunctionArn,
        Tags: { team: "billing" },
      }),
    );
    const refused = await call();

    // Then the tag decided both answers.
    assertResponseStatus(admitted, 200, await describeResponse(admitted));
    assertResponseStatus(refused, 403, await describeResponse(refused));
  });
});

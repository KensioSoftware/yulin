import {
  CreateFunctionCommand,
  CreateFunctionUrlConfigCommand,
} from "@aws-sdk/client-lambda";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { assertResponseStatus, describeResponse } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simAwsCallerHeaderName } from "../../iam/request/sim-aws-caller-header.js";
import { simAwsSourceIpHeaderName } from "../../iam/request/sim-aws-source-ip-header.js";
import { simIamPolicyDocumentFactory } from "../../iam/policy/sim-iam-policy-document.factory.js";
import { makeLambdaZipFileInput } from "../function/code/lambda-zip-file-input.js";

const accountId = "888888888888";
const callerRoleArn = `arn:aws:iam::${accountId}:role/Caller`;

describe("A sim Lambda Function URL and aws:SourceIp", () => {
  it("admits a caller only from the address range its policy allows", async () => {
    // Given an AWS_IAM Function URL, and a Role allowed to call it from one
    // address range
    const simAws = new SimAws();
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
        AuthType: "AWS_IAM",
      }),
    );
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
        PolicyName: "InvokeFromOffice",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Action: ["lambda:InvokeFunctionUrl", "lambda:InvokeFunction"],
            Resource: "*",
            Condition: { IpAddress: { "aws:SourceIp": "192.0.2.0/24" } },
          },
        }),
      }),
    );
    const url = new SimAwsLocalUrl({ input: FunctionUrl }).toString();
    const http = new SimAwsHttp({ simAws });

    // When the Role calls it from inside the range and from loopback
    const inside = await http.fetch(url, {
      headers: {
        [simAwsCallerHeaderName]: callerRoleArn,
        [simAwsSourceIpHeaderName]: "192.0.2.10",
      },
    });
    const loopback = await http.fetch(url, {
      headers: { [simAwsCallerHeaderName]: callerRoleArn },
    });

    // Then only the call from inside the range reaches the function
    assertResponseStatus(inside, 200, await describeResponse(inside));
    assertResponseStatus(loopback, 403, await describeResponse(loopback));
  });
});

import {
  CreateFunctionCommand,
  CreateFunctionUrlConfigCommand,
  DeleteFunctionUrlConfigCommand,
} from "@aws-sdk/client-lambda";
import { assertIdentical, assertObjectEquals } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import { SimAws } from "../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../function/code/lambda-zip-file-input.js";
import { simLambdaUrlForbiddenMessage } from "./response/sim-lambda-url-error-response.js";

function localUrl(functionUrl: string): string {
  return new SimAwsLocalUrl({ input: functionUrl }).toString();
}

describe("Serving sim Lambda Function URL failures", () => {
  it("returns 404 for a Function URL host that is not registered", async () => {
    // Given a simulated AWS with no Function URLs.
    const simAws = new SimAws();

    // When an invented Function URL host is requested.
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(
        "https://sn5f1tes4o11qsj5ue6cb5ndltmguteq.lambda-url.us-east-1.on.aws/",
      ),
    );

    // Then the endpoint reports it as not found, AWS-style.
    assertIdentical(response.status, 404);
    assertObjectEquals(await response.json(), { Message: "Not Found" });
  });

  it("returns 404 once the Function URL has been deleted", async () => {
    // Given a served Function URL that is then deleted.
    const simAws = new SimAws();
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "greeter",
        Role: "arn:aws:iam::111111111111:role/GreeterRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => "hello") },
      }),
    );

    // And a public Function URL for it.
    const { FunctionUrl: functionUrl } = await simAws
      .lambda()
      .createFunctionUrlConfig(
        new CreateFunctionUrlConfigCommand({
          FunctionName: "greeter",
          AuthType: "NONE",
        }),
      );
    await simAws
      .lambda()
      .deleteFunctionUrlConfig(
        new DeleteFunctionUrlConfigCommand({ FunctionName: "greeter" }),
      );

    // When the deleted Function URL is requested.
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(functionUrl),
    );

    // Then the hostname no longer serves anything.
    assertIdentical(response.status, 404);
  });

  it("returns 404 when the host names a different region", async () => {
    // Given a Function URL in the default region.
    const simAws = new SimAws();
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "greeter",
        Role: "arn:aws:iam::111111111111:role/GreeterRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => "hello") },
      }),
    );

    // And a public Function URL for it.
    const { FunctionUrl: functionUrl } = await simAws
      .lambda()
      .createFunctionUrlConfig(
        new CreateFunctionUrlConfigCommand({
          FunctionName: "greeter",
          AuthType: "NONE",
        }),
      );

    // When the same URL id is requested in another region.
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(functionUrl.replace("us-east-1", "eu-west-2")),
    );

    // Then it does not resolve, because Function URLs are region-scoped.
    assertIdentical(response.status, 404);
  });

  it("refuses an AWS_IAM Function URL request", async () => {
    // Given a Function URL that requires IAM authentication.
    const simAws = new SimAws();
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "greeter",
        Role: "arn:aws:iam::111111111111:role/GreeterRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => "hello") },
      }),
    );

    // And a Function URL for it that requires IAM authentication.
    const { FunctionUrl: functionUrl } = await simAws
      .lambda()
      .createFunctionUrlConfig(
        new CreateFunctionUrlConfigCommand({
          FunctionName: "greeter",
          AuthType: "AWS_IAM",
        }),
      );

    // When it is requested without a signature.
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(functionUrl),
    );

    // Then the request is forbidden, as an unsigned request is on AWS.
    assertIdentical(response.status, 403);
    assertObjectEquals(await response.json(), {
      Message: simLambdaUrlForbiddenMessage,
    });
  });

  it("returns 502 when the handler throws", async () => {
    // Given a function whose handler fails.
    const simAws = new SimAws();
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "greeter",
        Role: "arn:aws:iam::111111111111:role/GreeterRole",
        Code: {
          ZipFile: makeLambdaZipFileInput(() => {
            throw new Error("handler exploded");
          }),
        },
      }),
    );

    // And a public Function URL for it.
    const { FunctionUrl: functionUrl } = await simAws
      .lambda()
      .createFunctionUrlConfig(
        new CreateFunctionUrlConfigCommand({
          FunctionName: "greeter",
          AuthType: "NONE",
        }),
      );

    // When the Function URL is requested.
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(functionUrl),
    );

    // Then the endpoint reports a bad gateway, keeping the error out of the
    // response body as real Lambda does.
    assertIdentical(response.status, 502);
    assertObjectEquals(await response.json(), {
      Message: "Internal Server Error",
    });
  });
});

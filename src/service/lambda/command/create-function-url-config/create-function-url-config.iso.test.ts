import {
  CreateFunctionCommand,
  CreateFunctionUrlConfigCommand,
  GetFunctionUrlConfigCommand,
} from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertStringMatches,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import {
  SimLambdaResourceConflictException,
  SimLambdaResourceNotFoundException,
  SimLambdaValidationException,
} from "../../error/sim-lambda.error.js";
import { makeLambdaZipFileInput } from "../../function/code/lambda-zip-file-input.js";
import { SimLambda } from "../../sim-lambda.js";

describe("Lambda CreateFunctionUrlConfigCommand", () => {
  it("creates a Function URL in the AWS endpoint format", async () => {
    // Given a sim Lambda function.
    const simAws = new SimAws();
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "greeter",
        Role: "arn:aws:iam::111111111111:role/GreeterRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => "hello") },
      }),
    );

    // When a Function URL is created for it.
    const output = await simAws.lambda().createFunctionUrlConfig(
      new CreateFunctionUrlConfigCommand({
        FunctionName: "greeter",
        AuthType: "NONE",
      }),
    );

    // Then the URL has the AWS shape, naming the region it lives in.
    assertStringMatches(
      output.FunctionUrl,
      /^https:\/\/[a-z0-9]{32}\.lambda-url\.us-east-1\.on\.aws\/$/,
    );
    assertIdentical(output.AuthType, "NONE");
    assertIdentical(output.InvokeMode, "BUFFERED");
    assertIdentical(
      output.FunctionArn,
      `arn:aws:lambda:us-east-1:${simAws.defaultAccountId}:function:greeter`,
    );
  });

  it("keeps the same Function URL when read back", async () => {
    // Given a function with a Function URL.
    const simLambda = new SimLambda();
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "greeter",
        Role: "arn:aws:iam::111111111111:role/GreeterRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => "hello") },
      }),
    );
    const created = await simLambda.createFunctionUrlConfig(
      new CreateFunctionUrlConfigCommand({
        FunctionName: "greeter",
        AuthType: "NONE",
      }),
    );

    // When the Function URL config is read back.
    const read = await simLambda.getFunctionUrlConfig(
      new GetFunctionUrlConfigCommand({ FunctionName: "greeter" }),
    );

    // Then it is the same URL.
    assertIdentical(read.FunctionUrl, created.FunctionUrl);
  });

  it("gives each function its own Function URL", async () => {
    // Given two sim Lambda functions.
    const simLambda = new SimLambda();
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "greeter",
        Role: "arn:aws:iam::111111111111:role/GreeterRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => "hello") },
      }),
    );
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "other",
        Role: "arn:aws:iam::111111111111:role/OtherRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => "other") },
      }),
    );

    // When both get a Function URL.
    const greeterUrl = await simLambda.createFunctionUrlConfig(
      new CreateFunctionUrlConfigCommand({
        FunctionName: "greeter",
        AuthType: "NONE",
      }),
    );
    const otherUrl = await simLambda.createFunctionUrlConfig(
      new CreateFunctionUrlConfigCommand({
        FunctionName: "other",
        AuthType: "NONE",
      }),
    );

    // Then the URLs differ.
    assertTrue(
      greeterUrl.FunctionUrl !== otherUrl.FunctionUrl,
      "Expected distinct Function URLs",
    );
  });

  it("accepts an AWS_IAM Function URL and a RESPONSE_STREAM invoke mode", async () => {
    // Given a sim Lambda function.
    const simLambda = new SimLambda();
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "greeter",
        Role: "arn:aws:iam::111111111111:role/GreeterRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => "hello") },
      }),
    );

    // When a Function URL is created with non-default configuration.
    const output = await simLambda.createFunctionUrlConfig(
      new CreateFunctionUrlConfigCommand({
        FunctionName: "greeter",
        AuthType: "AWS_IAM",
        InvokeMode: "RESPONSE_STREAM",
      }),
    );

    // Then the configuration is reported back.
    assertIdentical(output.AuthType, "AWS_IAM");
    assertIdentical(output.InvokeMode, "RESPONSE_STREAM");
  });

  it("throws on a function that does not exist", async () => {
    // Given a simulated AWS with no functions.
    const simAws = new SimAws();

    // When a Function URL is created for a missing function.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.lambda().createFunctionUrlConfig(
        new CreateFunctionUrlConfigCommand({
          FunctionName: "missing",
          AuthType: "NONE",
        }),
      ),
    );

    // Then it fails the way AWS reports an unknown function.
    assertInstanceOf(error, SimLambdaResourceNotFoundException);
    assertStringIncludes(error.message, ":function:missing");
  });

  it("throws when the function already has a Function URL", async () => {
    // Given a function that already has a Function URL.
    const simLambda = new SimLambda();
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "greeter",
        Role: "arn:aws:iam::111111111111:role/GreeterRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => "hello") },
      }),
    );
    await simLambda.createFunctionUrlConfig(
      new CreateFunctionUrlConfigCommand({
        FunctionName: "greeter",
        AuthType: "NONE",
      }),
    );

    // When a second Function URL is created for it.
    const error = await assertThrowsErrorAsync(async () =>
      simLambda.createFunctionUrlConfig(
        new CreateFunctionUrlConfigCommand({
          FunctionName: "greeter",
          AuthType: "NONE",
        }),
      ),
    );

    // Then it conflicts, as it does on AWS.
    assertInstanceOf(error, SimLambdaResourceConflictException);
    assertStringIncludes(error.message, "FunctionUrlConfig exists");
  });

  it("throws on a missing AuthType", async () => {
    // Given a sim Lambda function.
    const simLambda = new SimLambda();
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "greeter",
        Role: "arn:aws:iam::111111111111:role/GreeterRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => "hello") },
      }),
    );

    // When a Function URL is created without an AuthType, which the SDK types
    // as required but a plain JavaScript caller can still omit.
    const error = await assertThrowsErrorAsync(async () =>
      simLambda.createFunctionUrlConfig({ input: { FunctionName: "greeter" } }),
    );

    // Then the required value is reported as a validation failure.
    assertInstanceOf(error, SimLambdaValidationException);
    assertStringIncludes(error.message, "'authType'");
  });

  it("throws on an unknown AuthType", async () => {
    // Given a sim Lambda function.
    const simLambda = new SimLambda();
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "greeter",
        Role: "arn:aws:iam::111111111111:role/GreeterRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => "hello") },
      }),
    );

    // When a Function URL is created with an AuthType AWS does not have.
    const error = await assertThrowsErrorAsync(async () =>
      simLambda.createFunctionUrlConfig({
        input: { FunctionName: "greeter", AuthType: "OPEN_SESAME" as "NONE" },
      }),
    );

    // Then the enum member is reported as a validation failure.
    assertInstanceOf(error, SimLambdaValidationException);
    assertStringIncludes(error.message, "OPEN_SESAME");
  });

  it("throws on an unknown InvokeMode", async () => {
    // Given a sim Lambda function.
    const simLambda = new SimLambda();
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "greeter",
        Role: "arn:aws:iam::111111111111:role/GreeterRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => "hello") },
      }),
    );

    // When a Function URL is created with an InvokeMode AWS does not have.
    const error = await assertThrowsErrorAsync(async () =>
      simLambda.createFunctionUrlConfig({
        input: {
          FunctionName: "greeter",
          AuthType: "NONE",
          InvokeMode: "FIREHOSE" as "BUFFERED",
        },
      }),
    );

    // Then the enum member is reported as a validation failure.
    assertInstanceOf(error, SimLambdaValidationException);
    assertStringIncludes(error.message, "'invokeMode'");
  });

  it("throws on an undefined function name", async () => {
    // Given a standalone sim Lambda.
    const simLambda = new SimLambda();

    // When a Function URL is created without naming a function.
    const error = await assertThrowsErrorAsync(async () =>
      simLambda.createFunctionUrlConfig(
        new CreateFunctionUrlConfigCommand({
          FunctionName: undefined,
          AuthType: "NONE",
        }),
      ),
    );

    // Then the missing input is reported.
    assertStringIncludes(
      error.message,
      "CreateFunctionUrlConfigCommand.input.FunctionName required",
    );
  });

  it("denies an explicitly anonymous caller through sim IAM", async () => {
    // Given a simulated AWS with sim IAM in play.
    const simAws = new SimAws();

    // When an anonymous caller creates a Function URL.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.lambda().createFunctionUrlConfig(
        new CreateFunctionUrlConfigCommand({
          FunctionName: "greeter",
          AuthType: "NONE",
        }),
        { caller: { kind: "anonymous" } },
      ),
    );

    // Then the request is denied for the matching IAM action.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "lambda:CreateFunctionUrlConfig");
  });
});

import {
  CreateFunctionCommand,
  CreateFunctionUrlConfigCommand,
  UpdateFunctionUrlConfigCommand,
} from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import {
  SimLambdaResourceNotFoundException,
  SimLambdaValidationException,
} from "../../error/sim-lambda.error.js";
import { makeLambdaZipFileInput } from "../../function/code/lambda-zip-file-input.js";
import { SimLambda } from "../../sim-lambda.js";

describe("Lambda UpdateFunctionUrlConfigCommand", () => {
  it("updates the auth type without changing the URL", async () => {
    // Given a function with a public Function URL.
    const simLambda = new SimLambda();
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "greeter",
        Role: "arn:aws:iam::111111111111:role/GreeterRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => "hello") },
      }),
    );

    // And a public Function URL for it.
    const created = await simLambda.createFunctionUrlConfig(
      new CreateFunctionUrlConfigCommand({
        FunctionName: "greeter",
        AuthType: "NONE",
      }),
    );

    // When the auth type is updated.
    const output = await simLambda.updateFunctionUrlConfig(
      new UpdateFunctionUrlConfigCommand({
        FunctionName: "greeter",
        AuthType: "AWS_IAM",
      }),
    );

    // Then the new auth type applies to the same URL.
    assertIdentical(output.AuthType, "AWS_IAM");
    assertIdentical(output.FunctionUrl, created.FunctionUrl);
  });

  it("leaves omitted values as they are", async () => {
    // Given a Function URL with a non-default invoke mode.
    const simLambda = new SimLambda();
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "greeter",
        Role: "arn:aws:iam::111111111111:role/GreeterRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => "hello") },
      }),
    );

    // And a Function URL for it with a non-default invoke mode.
    await simLambda.createFunctionUrlConfig(
      new CreateFunctionUrlConfigCommand({
        FunctionName: "greeter",
        AuthType: "NONE",
        InvokeMode: "RESPONSE_STREAM",
      }),
    );

    // When only the auth type is updated.
    const output = await simLambda.updateFunctionUrlConfig(
      new UpdateFunctionUrlConfigCommand({
        FunctionName: "greeter",
        AuthType: "AWS_IAM",
      }),
    );

    // Then the invoke mode is untouched.
    assertIdentical(output.AuthType, "AWS_IAM");
    assertIdentical(output.InvokeMode, "RESPONSE_STREAM");
  });

  it("throws when the function has no Function URL", async () => {
    // Given a function without a Function URL.
    const simAws = new SimAws();
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "greeter",
        Role: "arn:aws:iam::111111111111:role/GreeterRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => "hello") },
      }),
    );

    // When its Function URL config is updated.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.lambda().updateFunctionUrlConfig(
        new UpdateFunctionUrlConfigCommand({
          FunctionName: "greeter",
          AuthType: "AWS_IAM",
        }),
      ),
    );

    // Then it fails as a missing resource.
    assertInstanceOf(error, SimLambdaResourceNotFoundException);
    assertStringIncludes(error.message, "Function URL config not found");
  });

  it("throws on a function that does not exist", async () => {
    // Given a simulated AWS with no functions.
    const simAws = new SimAws();

    // When a Function URL config is updated for a missing function.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.lambda().updateFunctionUrlConfig(
        new UpdateFunctionUrlConfigCommand({
          FunctionName: "missing",
          AuthType: "NONE",
        }),
      ),
    );

    // Then the missing function is what gets reported.
    assertInstanceOf(error, SimLambdaResourceNotFoundException);
    assertStringIncludes(error.message, "Function not found");
  });

  it("throws on an unknown auth type", async () => {
    // Given a function with a Function URL.
    const simLambda = new SimLambda();
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "greeter",
        Role: "arn:aws:iam::111111111111:role/GreeterRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => "hello") },
      }),
    );

    // And a Function URL for it.
    await simLambda.createFunctionUrlConfig(
      new CreateFunctionUrlConfigCommand({
        FunctionName: "greeter",
        AuthType: "NONE",
      }),
    );

    // When it is updated to an auth type AWS does not have.
    const error = await assertThrowsErrorAsync(async () =>
      simLambda.updateFunctionUrlConfig({
        input: { FunctionName: "greeter", AuthType: "OPEN_SESAME" as "NONE" },
      }),
    );

    // Then the enum member is reported as a validation failure.
    assertInstanceOf(error, SimLambdaValidationException);
    assertStringIncludes(error.message, "OPEN_SESAME");
  });

  it("throws on an undefined function name", async () => {
    // Given a standalone sim Lambda.
    const simLambda = new SimLambda();

    // When a Function URL config is updated without naming a function.
    const error = await assertThrowsErrorAsync(async () =>
      simLambda.updateFunctionUrlConfig(
        new UpdateFunctionUrlConfigCommand({ FunctionName: undefined }),
      ),
    );

    // Then the missing input is reported.
    assertStringIncludes(
      error.message,
      "UpdateFunctionUrlConfigCommand.input.FunctionName required",
    );
  });

  it("denies an explicitly anonymous caller through sim IAM", async () => {
    // Given a simulated AWS with sim IAM in play.
    const simAws = new SimAws();

    // When an anonymous caller updates a Function URL config.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.lambda().updateFunctionUrlConfig(
        new UpdateFunctionUrlConfigCommand({
          FunctionName: "greeter",
          AuthType: "NONE",
        }),
        { caller: { kind: "anonymous" } },
      ),
    );

    // Then the request is denied for the matching IAM action.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "lambda:UpdateFunctionUrlConfig");
  });
});

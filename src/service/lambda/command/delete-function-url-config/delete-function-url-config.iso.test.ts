import {
  CreateFunctionCommand,
  CreateFunctionUrlConfigCommand,
  DeleteFunctionUrlConfigCommand,
  GetFunctionUrlConfigCommand,
} from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { SimLambdaResourceNotFoundException } from "../../error/sim-lambda.error.js";
import { makeLambdaZipFileInput } from "../../function/code/lambda-zip-file-input.js";
import { SimLambda } from "../../sim-lambda.js";

describe("Lambda DeleteFunctionUrlConfigCommand", () => {
  it("deletes a Function URL so it can no longer be read", async () => {
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

    // When the Function URL is deleted.
    await simLambda.deleteFunctionUrlConfig(
      new DeleteFunctionUrlConfigCommand({ FunctionName: "greeter" }),
    );

    // Then reading it back fails as a missing resource.
    const error = await assertThrowsErrorAsync(async () =>
      simLambda.getFunctionUrlConfig(
        new GetFunctionUrlConfigCommand({ FunctionName: "greeter" }),
      ),
    );
    assertInstanceOf(error, SimLambdaResourceNotFoundException);
  });

  it("stops the deleted URL id resolving to a Function URL", async () => {
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
    const functionUrl = simLambda.getSimFunctionUrl("greeter");
    assertNonNullable(functionUrl);

    // When the Function URL is deleted.
    await simLambda.deleteFunctionUrlConfig(
      new DeleteFunctionUrlConfigCommand({ FunctionName: "greeter" }),
    );

    // Then its id no longer finds anything to serve.
    assertUndefined(simLambda.getSimFunctionUrlById(functionUrl.urlId));
  });

  it("allows a new Function URL after deleting the old one", async () => {
    // Given a function whose Function URL has been deleted.
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
    await simLambda.deleteFunctionUrlConfig(
      new DeleteFunctionUrlConfigCommand({ FunctionName: "greeter" }),
    );

    // When a new Function URL is created.
    const output = await simLambda.createFunctionUrlConfig(
      new CreateFunctionUrlConfigCommand({
        FunctionName: "greeter",
        AuthType: "NONE",
      }),
    );

    // Then the function is reachable again, at a new URL.
    assertStringIncludes(output.FunctionUrl, ".lambda-url.");
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

    // When its Function URL is deleted.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .lambda()
        .deleteFunctionUrlConfig(
          new DeleteFunctionUrlConfigCommand({ FunctionName: "greeter" }),
        ),
    );

    // Then it fails as a missing resource.
    assertInstanceOf(error, SimLambdaResourceNotFoundException);
    assertStringIncludes(error.message, "Function URL config not found");
  });

  it("throws on a function that does not exist", async () => {
    // Given a simulated AWS with no functions.
    const simAws = new SimAws();

    // When a Function URL is deleted for a missing function.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .lambda()
        .deleteFunctionUrlConfig(
          new DeleteFunctionUrlConfigCommand({ FunctionName: "missing" }),
        ),
    );

    // Then the missing function is what gets reported.
    assertInstanceOf(error, SimLambdaResourceNotFoundException);
    assertStringIncludes(error.message, "Function not found");
  });

  it("throws on an undefined function name", async () => {
    // Given a standalone sim Lambda.
    const simLambda = new SimLambda();

    // When a Function URL is deleted without naming a function.
    const error = await assertThrowsErrorAsync(async () =>
      simLambda.deleteFunctionUrlConfig(
        new DeleteFunctionUrlConfigCommand({ FunctionName: undefined }),
      ),
    );

    // Then the missing input is reported.
    assertStringIncludes(
      error.message,
      "DeleteFunctionUrlConfigCommand.input.FunctionName required",
    );
  });

  it("denies an explicitly anonymous caller through sim IAM", async () => {
    // Given a simulated AWS with sim IAM in play.
    const simAws = new SimAws();

    // When an anonymous caller deletes a Function URL.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .lambda()
        .deleteFunctionUrlConfig(
          new DeleteFunctionUrlConfigCommand({ FunctionName: "greeter" }),
          { caller: { kind: "anonymous" } },
        ),
    );

    // Then the request is denied for the matching IAM action.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "lambda:DeleteFunctionUrlConfig");
  });
});

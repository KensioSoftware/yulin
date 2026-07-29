import {
  CreateFunctionCommand,
  CreateFunctionUrlConfigCommand,
  ListFunctionUrlConfigsCommand,
} from "@aws-sdk/client-lambda";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { SimLambdaResourceNotFoundException } from "../../error/sim-lambda.error.js";
import { makeLambdaZipFileInput } from "../../function/code/lambda-zip-file-input.js";
import { SimLambda } from "../../sim-lambda.js";

describe("Lambda ListFunctionUrlConfigsCommand", () => {
  it("lists the Function URL a function has", async () => {
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

    // When its Function URL configs are listed.
    const output = await simLambda.listFunctionUrlConfigs(
      new ListFunctionUrlConfigsCommand({ FunctionName: "greeter" }),
    );

    // Then the one configuration is listed.
    assertArrayLength(output.FunctionUrlConfigs, 1);
    const config = output.FunctionUrlConfigs[0];
    assertNonNullable(config);
    assertIdentical(config.FunctionUrl, created.FunctionUrl);
  });

  it("lists nothing for a function without a Function URL", async () => {
    // Given a function without a Function URL.
    const simLambda = new SimLambda();
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "greeter",
        Role: "arn:aws:iam::111111111111:role/GreeterRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => "hello") },
      }),
    );

    // When its Function URL configs are listed.
    const output = await simLambda.listFunctionUrlConfigs(
      new ListFunctionUrlConfigsCommand({ FunctionName: "greeter" }),
    );

    // Then the list is empty rather than an error.
    assertArrayLength(output.FunctionUrlConfigs, 0);
  });

  it("throws on a function that does not exist", async () => {
    // Given a simulated AWS with no functions.
    const simAws = new SimAws();

    // When Function URL configs are listed for a missing function.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .lambda()
        .listFunctionUrlConfigs(
          new ListFunctionUrlConfigsCommand({ FunctionName: "missing" }),
        ),
    );

    // Then the missing function is what gets reported.
    assertInstanceOf(error, SimLambdaResourceNotFoundException);
    assertStringIncludes(error.message, "Function not found");
  });

  it("throws on an undefined function name", async () => {
    // Given a standalone sim Lambda.
    const simLambda = new SimLambda();

    // When Function URL configs are listed without naming a function.
    const error = await assertThrowsErrorAsync(async () =>
      simLambda.listFunctionUrlConfigs(
        new ListFunctionUrlConfigsCommand({ FunctionName: undefined }),
      ),
    );

    // Then the missing input is reported.
    assertStringIncludes(
      error.message,
      "ListFunctionUrlConfigsCommand.input.FunctionName required",
    );
  });

  it("denies an explicitly anonymous caller through sim IAM", async () => {
    // Given a simulated AWS with sim IAM in play.
    const simAws = new SimAws();

    // When an anonymous caller lists Function URL configs.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .lambda()
        .listFunctionUrlConfigs(
          new ListFunctionUrlConfigsCommand({ FunctionName: "greeter" }),
          { caller: { kind: "anonymous" } },
        ),
    );

    // Then the request is denied for the matching IAM action.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "lambda:ListFunctionUrlConfigs");
  });
});

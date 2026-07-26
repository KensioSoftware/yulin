import {
  CreateFunctionCommand,
  CreateFunctionUrlConfigCommand,
  GetFunctionUrlConfigCommand,
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
import { SimLambdaResourceNotFoundException } from "../../error/sim-lambda.error.js";
import { makeLambdaZipFileInput } from "../../function/code/lambda-zip-file-input.js";
import { SimLambda } from "../../sim-lambda.js";

async function createGreeter(simLambda: SimLambda): Promise<void> {
  await simLambda.createFunction(
    new CreateFunctionCommand({
      FunctionName: "greeter",
      Role: "arn:aws:iam::111111111111:role/GreeterRole",
      Code: { ZipFile: makeLambdaZipFileInput(() => "hello") },
    }),
  );
}

describe("Lambda GetFunctionUrlConfigCommand", () => {
  it("gets an existing Function URL configuration", async () => {
    // Given a function with an AWS_IAM Function URL.
    const simLambda = new SimLambda();
    await createGreeter(simLambda);
    await simLambda.createFunctionUrlConfig(
      new CreateFunctionUrlConfigCommand({
        FunctionName: "greeter",
        AuthType: "AWS_IAM",
      }),
    );

    // When the configuration is read.
    const output = await simLambda.getFunctionUrlConfig(
      new GetFunctionUrlConfigCommand({ FunctionName: "greeter" }),
    );

    // Then the stored configuration is reported, with both timestamps.
    assertIdentical(output.AuthType, "AWS_IAM");
    assertIdentical(output.InvokeMode, "BUFFERED");
    assertIdentical(output.CreationTime, output.LastModifiedTime);
  });

  it("throws when the function has no Function URL", async () => {
    // Given a function without a Function URL.
    const simAws = new SimAws();
    await createGreeter(simAws.lambda());

    // When its Function URL config is read.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .lambda()
        .getFunctionUrlConfig(
          new GetFunctionUrlConfigCommand({ FunctionName: "greeter" }),
        ),
    );

    // Then it fails as a missing resource, naming the function.
    assertInstanceOf(error, SimLambdaResourceNotFoundException);
    assertStringIncludes(error.message, ":function:greeter");
  });

  it("throws on a function that does not exist", async () => {
    // Given a simulated AWS with no functions.
    const simAws = new SimAws();

    // When a Function URL config is read for a missing function.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .lambda()
        .getFunctionUrlConfig(
          new GetFunctionUrlConfigCommand({ FunctionName: "missing" }),
        ),
    );

    // Then the missing function is what gets reported.
    assertInstanceOf(error, SimLambdaResourceNotFoundException);
    assertStringIncludes(error.message, "Function not found");
  });

  it("throws on an undefined function name", async () => {
    // Given a standalone sim Lambda.
    const simLambda = new SimLambda();

    // When a Function URL config is read without naming a function.
    const error = await assertThrowsErrorAsync(async () =>
      simLambda.getFunctionUrlConfig(
        new GetFunctionUrlConfigCommand({ FunctionName: undefined }),
      ),
    );

    // Then the missing input is reported.
    assertStringIncludes(
      error.message,
      "GetFunctionUrlConfigCommand.input.FunctionName required",
    );
  });

  it("denies an explicitly anonymous caller through sim IAM", async () => {
    // Given a simulated AWS with sim IAM in play.
    const simAws = new SimAws();

    // When an anonymous caller reads a Function URL config.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .lambda()
        .getFunctionUrlConfig(
          new GetFunctionUrlConfigCommand({ FunctionName: "greeter" }),
          { caller: { kind: "anonymous" } },
        ),
    );

    // Then the request is denied for the matching IAM action.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "lambda:GetFunctionUrlConfig");
  });
});

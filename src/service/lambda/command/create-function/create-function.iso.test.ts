import {
  CreateFunctionCommand,
  GetFunctionCommand,
} from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimLambdaResourceConflictException,
  SimLambdaUnsupportedCodeInput,
} from "../../error/sim-lambda.error.js";
import { makeLambdaZipFileInput } from "../../function/code/lambda-zip-file-input.js";

describe("Lambda CreateFunctionCommand", () => {
  it("creates a new Lambda function that becomes Active in the background", async () => {
    const simAws = new SimAws();
    const simLambda = simAws.lambda();
    const roleArn = `arn:aws:iam::${simAws.defaultAccountId}:role/GreeterRole`;

    const creation = await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "greeter",
        Role: roleArn,
        Handler: "index.handler",
        Runtime: "nodejs22.x",
        Description: "Greets by name",
        Timeout: 10,
        MemorySize: 256,
        Code: {
          ZipFile: makeLambdaZipFileInput(
            (event: { name: string }) => `Hello ${event.name}`,
          ),
        },
      }),
    );

    assertIdentical(creation.FunctionName, "greeter");
    assertIdentical(
      creation.FunctionArn,
      `arn:aws:lambda:${simAws.defaultRegionName}:` +
        `${simAws.defaultAccountId}:function:greeter`,
    );
    assertIdentical(creation.Role, roleArn);
    assertIdentical(creation.State, "Pending");
    assertIdentical(creation.Version, "$LATEST");
    assertIdentical(creation.Handler, "index.handler");
    assertIdentical(creation.Runtime, "nodejs22.x");
    assertIdentical(creation.Description, "Greets by name");
    assertIdentical(creation.Timeout, 10);
    assertIdentical(creation.MemorySize, 256);

    await simAws.backgroundTasksComplete();

    const fetched = await simLambda.getFunction(
      new GetFunctionCommand({ FunctionName: "greeter" }),
    );
    assertIdentical(fetched.Configuration.State, "Active");
  });

  it("throws on undefined function name", async () => {
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(async () =>
      simAws.lambda().createFunction(
        new CreateFunctionCommand({
          FunctionName: undefined,
          Role: "arn:aws:iam::111111111111:role/SomeRole",
          Code: { ZipFile: makeLambdaZipFileInput(() => null) },
        }),
      ),
    );

    assertStringIncludes(
      error.message,
      "CreateFunctionCommand.input.FunctionName required",
    );
  });

  it("throws on undefined execution Role", async () => {
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(async () =>
      simAws.lambda().createFunction(
        new CreateFunctionCommand({
          FunctionName: "role-less",
          Role: undefined,
          Code: { ZipFile: makeLambdaZipFileInput(() => null) },
        }),
      ),
    );

    assertStringIncludes(
      error.message,
      "CreateFunctionCommand.input.Role required",
    );
  });

  it("throws on missing function code", async () => {
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(async () =>
      simAws.lambda().createFunction(
        new CreateFunctionCommand({
          FunctionName: "code-less",
          Role: "arn:aws:iam::111111111111:role/SomeRole",
          Code: {},
        }),
      ),
    );

    assertStringIncludes(
      error.message,
      "CreateFunctionCommand.input.Code.ZipFile required",
    );
  });

  it("rejects real zip file bytes as unsupported code input", async () => {
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(async () =>
      simAws.lambda().createFunction(
        new CreateFunctionCommand({
          FunctionName: "real-zip",
          Role: "arn:aws:iam::111111111111:role/SomeRole",
          Code: { ZipFile: Buffer.from("PK real zip bytes") },
        }),
      ),
    );

    assertInstanceOf(error, SimLambdaUnsupportedCodeInput);
    assertStringIncludes(error.message, "makeLambdaZipFileInput");
  });

  it("throws on duplicate function name", async () => {
    const simAws = new SimAws();
    const simLambda = simAws.lambda();

    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "duplicated",
        Role: "arn:aws:iam::111111111111:role/SomeRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => null) },
      }),
    );

    const error = await assertThrowsErrorAsync(async () =>
      simAws.lambda().createFunction(
        new CreateFunctionCommand({
          FunctionName: "duplicated",
          Role: "arn:aws:iam::111111111111:role/SomeRole",
          Code: { ZipFile: makeLambdaZipFileInput(() => null) },
        }),
      ),
    );

    assertInstanceOf(error, SimLambdaResourceConflictException);
    assertStringIncludes(error.message, "Function already exist");
    assertIdentical(error.$metadata.httpStatusCode, 409);

    await simAws.backgroundTasksComplete();
  });
});

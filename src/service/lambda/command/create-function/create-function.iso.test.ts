import {
  CreateFunctionCommand,
  GetFunctionCommand,
} from "@aws-sdk/client-lambda";
import {
  assertArrayIncludes,
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimLambdaInvalidParameterValueException,
  SimLambdaResourceConflictException,
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

    assertInstanceOf(error, SimLambdaInvalidParameterValueException);
    assertStringIncludes(
      error.message,
      "requires either ZipFile bytes or an S3Bucket and S3Key",
    );
  });

  it("rejects bytes that are not a zip archive, like real AWS", async () => {
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(async () =>
      simAws.lambda().createFunction(
        new CreateFunctionCommand({
          FunctionName: "real-zip",
          Role: "arn:aws:iam::111111111111:role/SomeRole",
          Handler: "index.handler",
          Code: { ZipFile: Buffer.from("not really zip bytes") },
        }),
      ),
    );

    assertInstanceOf(error, SimLambdaInvalidParameterValueException);
    assertStringIncludes(error.message, "Could not unzip uploaded file");
    assertInstanceOf(error.cause, Error);
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

  it("rejects one of two concurrent creates with the same name", async () => {
    // Given two createFunction calls racing for the same function name; code
    // resolution awaits, so both can pass the initial duplicate check.
    const simAws = new SimAws();
    const simLambda = simAws.lambda();
    const racingCreate = async (): Promise<unknown> =>
      await simLambda.createFunction(
        new CreateFunctionCommand({
          FunctionName: "raced",
          Role: "arn:aws:iam::111111111111:role/SomeRole",
          Code: {
            ZipFile: makeLambdaZipFileInput(() => null),
          },
        }),
      );

    // When both creates run concurrently.
    const results = await Promise.allSettled([racingCreate(), racingCreate()]);

    // Then exactly one create wins and the other gets the conflict error,
    // rather than silently overwriting the stored function.
    const statuses = results.map((result) => result.status);
    assertArrayIncludes(statuses, "fulfilled");
    const rejections = results.filter((result) => result.status === "rejected");
    assertArrayLength(rejections, 1);
    assertInstanceOf(rejections[0].reason, SimLambdaResourceConflictException);

    await simAws.backgroundTasksComplete();
  });
});

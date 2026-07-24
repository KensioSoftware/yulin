import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimLambdaInvalidParameterValueException } from "../../error/sim-lambda.error.js";
import { makeLambdaCodeZip } from "../../function/code/make-lambda-code-zip.js";
import { makeLambdaZipFileInput } from "../../function/code/lambda-zip-file-input.js";

function parsePayload(payload: Uint8Array | undefined): unknown {
  assertNonNullable(payload);
  return JSON.parse(Buffer.from(payload).toString()) as unknown;
}

describe("Lambda CreateFunctionCommand zip code input", () => {
  it("creates and invokes a function from zipped source code", async () => {
    // Given a function created from real zip bytes of source code.
    const simAws = new SimAws();
    const simLambda = simAws.lambda();
    const codeZip = makeLambdaCodeZip(
      "exports.handler = async (event) => 'Hello ' + event.name;",
    );
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "zipped-greeter",
        Role: `arn:aws:iam::${simAws.defaultAccountId}:role/GreeterRole`,
        Handler: "index.handler",
        Runtime: "nodejs22.x",
        Code: { ZipFile: codeZip },
      }),
    );

    // When the function is invoked.
    const output = await simLambda.invoke(
      new InvokeCommand({
        FunctionName: "zipped-greeter",
        Payload: JSON.stringify({ name: "zip" }),
      }),
    );

    // Then the zipped source ran in the simulated runtime.
    assertIdentical(output.StatusCode, 200);
    assertIdentical(parsePayload(output.Payload), "Hello zip");

    await simAws.backgroundTasksComplete();
  });

  it("requires a Handler for zip function code", async () => {
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(async () =>
      simAws.lambda().createFunction(
        new CreateFunctionCommand({
          FunctionName: "handler-less",
          Role: "arn:aws:iam::111111111111:role/SomeRole",
          Code: { ZipFile: makeLambdaCodeZip("exports.handler = 1;") },
        }),
      ),
    );

    assertStringIncludes(
      error.message,
      "CreateFunctionCommand.input.Handler required",
    );
  });

  it("rejects providing both ZipFile and an S3 location", async () => {
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(async () =>
      simAws.lambda().createFunction(
        new CreateFunctionCommand({
          FunctionName: "both-sources",
          Role: "arn:aws:iam::111111111111:role/SomeRole",
          Handler: "index.handler",
          Code: {
            ZipFile: makeLambdaCodeZip("exports.handler = async () => null;"),
            S3Bucket: "code-bucket",
            S3Key: "code.zip",
          },
        }),
      ),
    );

    assertInstanceOf(error, SimLambdaInvalidParameterValueException);
    assertStringIncludes(error.message, "do not provide an S3 object location");
  });

  it("rejects an S3 location missing the bucket or key", async () => {
    const simAws = new SimAws();

    const bucketlessError = await assertThrowsErrorAsync(async () =>
      simAws.lambda().createFunction(
        new CreateFunctionCommand({
          FunctionName: "bucket-less",
          Role: "arn:aws:iam::111111111111:role/SomeRole",
          Handler: "index.handler",
          Code: { S3Key: "code.zip" },
        }),
      ),
    );
    assertStringIncludes(bucketlessError.message, "S3Bucket required");

    const keylessError = await assertThrowsErrorAsync(async () =>
      simAws.lambda().createFunction(
        new CreateFunctionCommand({
          FunctionName: "key-less",
          Role: "arn:aws:iam::111111111111:role/SomeRole",
          Handler: "index.handler",
          Code: { S3Bucket: "code-bucket" },
        }),
      ),
    );
    assertStringIncludes(keylessError.message, "S3Key required");
  });

  it("does not require a Handler for a handler function reference", async () => {
    // Given a stowaway handler reference, where Handler stays optional
    // because no module lookup is needed.
    const simAws = new SimAws();
    const simLambda = simAws.lambda();
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "reference",
        Role: "arn:aws:iam::111111111111:role/SomeRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => "referenced") },
      }),
    );

    const output = await simLambda.invoke(
      new InvokeCommand({ FunctionName: "reference" }),
    );

    assertIdentical(parsePayload(output.Payload), "referenced");

    await simAws.backgroundTasksComplete();
  });

  it("surfaces cold start problems as invocation function errors", async () => {
    // Given zipped code whose handler export is missing; as on real AWS,
    // creation succeeds and the problem surfaces at invocation.
    const simAws = new SimAws();
    const simLambda = simAws.lambda();
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "cold-start-broken",
        Role: "arn:aws:iam::111111111111:role/SomeRole",
        Handler: "index.missingHandler",
        Code: {
          ZipFile: makeLambdaCodeZip("exports.handler = async () => null;"),
        },
      }),
    );

    // When the function is invoked.
    const output = await simLambda.invoke(
      new InvokeCommand({ FunctionName: "cold-start-broken", Payload: "{}" }),
    );

    // Then the invocation reports the AWS-like runtime errorType.
    assertIdentical(output.StatusCode, 200);
    assertIdentical(output.FunctionError, "Unhandled");
    const errorPayload = parsePayload(output.Payload) as {
      errorType: string;
      errorMessage: string;
    };
    assertIdentical(errorPayload.errorType, "Runtime.HandlerNotFound");
    assertStringIncludes(errorPayload.errorMessage, "index.missingHandler");

    await simAws.backgroundTasksComplete();
  });
});

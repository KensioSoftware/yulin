import {
  CreateFunctionCommand,
  InvokeCommand,
  UpdateFunctionCodeCommand,
} from "@aws-sdk/client-lambda";
import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
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
import { SimLambda } from "../../sim-lambda.js";

const ordersRepositoryUri =
  "888888888888.dkr.ecr.us-east-1.amazonaws.com/orders";

function parsePayload(payload: Uint8Array | undefined): unknown {
  assertNonNullable(payload);
  return JSON.parse(Buffer.from(payload).toString()) as unknown;
}

async function createHandlerFunction(simAws: SimAws): Promise<void> {
  await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: "orders",
      Role: `arn:aws:iam::${simAws.defaultAccountId}:role/OrdersRole`,
      Code: { ZipFile: makeLambdaZipFileInput(() => "first") },
    }),
  );
}

describe("Lambda UpdateFunctionCodeCommand code sources", () => {
  it("replaces code with a zip archive stored in sim S3", async () => {
    // Given a zip code function, and replacement code stored in sim S3 the way
    // SAM and CDK deploy it.
    const simAws = new SimAws();
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "orders",
        Role: `arn:aws:iam::${simAws.defaultAccountId}:role/OrdersRole`,
        Handler: "index.handler",
        Runtime: "nodejs22.x",
        Code: {
          ZipFile: makeLambdaCodeZip("exports.handler = async () => 1;"),
        },
      }),
    );
    const simS3 = simAws.s3();
    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "code-bucket" }),
    );
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "code-bucket",
        Key: "artifacts/orders.zip",
        Body: makeLambdaCodeZip("exports.handler = async () => 'from S3';"),
      }),
    );

    // When the function's code is replaced from that object.
    await simAws.lambda().updateFunctionCode(
      new UpdateFunctionCodeCommand({
        FunctionName: "orders",
        S3Bucket: "code-bucket",
        S3Key: "artifacts/orders.zip",
      }),
    );

    // Then the stored archive is what runs, under the Handler the function
    // already had. UpdateFunctionCode carries no Handler of its own.
    const invoked = await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "orders" }));
    assertIdentical(parsePayload(invoked.Payload), "from S3");

    await simAws.backgroundTasksComplete();
  });

  it("replaces code with the image a simulated ECR repository holds", async () => {
    // Given a container image function, and another handler registered as a
    // second repository's image.
    const simAws = new SimAws();
    simAws
      .ecr()
      .repository("orders")
      .simulateImage({ handler: () => "first image" });
    simAws
      .ecr()
      .repository("orders-next")
      .simulateImage({ handler: () => "second image" });
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "orders",
        Role: "arn:aws:iam::888888888888:role/OrdersRole",
        PackageType: "Image",
        Code: { ImageUri: `${ordersRepositoryUri}:latest` },
      }),
    );

    // When the function is pointed at the second image.
    await simAws.lambda().updateFunctionCode(
      new UpdateFunctionCodeCommand({
        FunctionName: "orders",
        ImageUri:
          "888888888888.dkr.ecr.us-east-1.amazonaws.com/orders-next:latest",
      }),
    );

    // Then the handler that repository holds is what runs.
    const invoked = await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "orders" }));
    assertIdentical(parsePayload(invoked.Payload), "second image");
  });

  it("refuses an image URI no simulated repository holds an image for", async () => {
    const simAws = new SimAws();
    await createHandlerFunction(simAws);

    const error = await assertThrowsErrorAsync(async () =>
      simAws.lambda().updateFunctionCode(
        new UpdateFunctionCodeCommand({
          FunctionName: "orders",
          ImageUri: `${ordersRepositoryUri}:latest`,
        }),
      ),
    );

    assertInstanceOf(error, SimLambdaInvalidParameterValueException);
    assertStringIncludes(error.message, "cannot be run");
  });

  it("requires one of ZipFile, an S3 location or an ImageUri", async () => {
    const simLambda = new SimLambda();
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "orders",
        Role: "arn:aws:iam::111111111111:role/OrdersRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => "first") },
      }),
    );

    const error = await assertThrowsErrorAsync(async () =>
      simLambda.updateFunctionCode(
        new UpdateFunctionCodeCommand({ FunctionName: "orders" }),
      ),
    );

    // Then the refusal names the members as UpdateFunctionCode carries them,
    // at the top level rather than under Code.
    assertInstanceOf(error, SimLambdaInvalidParameterValueException);
    assertStringIncludes(
      error.message,
      "UpdateFunctionCodeCommand.input requires either ZipFile bytes",
    );
  });

  it("refuses both ZipFile bytes and an S3 location at once", async () => {
    const simLambda = new SimLambda();
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "orders",
        Role: "arn:aws:iam::111111111111:role/OrdersRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => "first") },
      }),
    );

    const error = await assertThrowsErrorAsync(async () =>
      simLambda.updateFunctionCode(
        new UpdateFunctionCodeCommand({
          FunctionName: "orders",
          ZipFile: makeLambdaZipFileInput(() => "second"),
          S3Bucket: "code-bucket",
          S3Key: "artifacts/orders.zip",
        }),
      ),
    );

    assertInstanceOf(error, SimLambdaInvalidParameterValueException);
    assertStringIncludes(error.message, "when using ZipFile");
  });

  it("refuses an S3 bucket with no key", async () => {
    const simLambda = new SimLambda();
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "orders",
        Role: "arn:aws:iam::111111111111:role/OrdersRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => "first") },
      }),
    );

    const error = await assertThrowsErrorAsync(async () =>
      simLambda.updateFunctionCode(
        new UpdateFunctionCodeCommand({
          FunctionName: "orders",
          S3Bucket: "code-bucket",
        }),
      ),
    );

    assertStringIncludes(
      error.message,
      "UpdateFunctionCodeCommand.input.S3Key required with S3Bucket",
    );
  });
});

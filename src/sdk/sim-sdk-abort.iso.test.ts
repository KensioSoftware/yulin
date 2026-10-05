import { describe, it } from "vitest";
import { faker } from "@faker-js/faker";
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import {
  CreateFunctionCommand,
  InvokeCommand,
  LambdaClient,
} from "@aws-sdk/client-lambda";
import {
  CreateBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  assertIdentical,
  assertInstanceOf,
  assertObjectMatches,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { SimAws } from "../service/aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../service/lambda/function/code/lambda-zip-file-input.js";
import { SimSdk } from "./sim-sdk.js";

describe("simulated AWS SDK abort signals", () => {
  const regionName = "eu-west-2";

  function converse(): ConverseCommand {
    return new ConverseCommand({
      modelId: "anthropic.claude-sonnet-4-5",
      messages: [{ role: "user", content: [{ text: faker.lorem.sentence() }] }],
    });
  }

  it("rejects a Converse sent with a signal that has already fired", async () => {
    // Given an intercepted Bedrock Runtime client with an answer declared.
    const simAws = new SimAws({ defaultRegionName: regionName });
    using simSdk = new SimSdk({ simAws });
    simSdk.intercept(BedrockRuntimeClient);
    simAws.bedrock().responses().byDefault({ text: "yes" });
    const client = new BedrockRuntimeClient({ region: regionName });

    // When a conversation is sent with a signal that has already fired.
    const signal = AbortSignal.abort();
    const error = await assertThrowsErrorAsync(async () => {
      await client.send(converse(), { abortSignal: signal });
    });

    // Then it rejects with the AbortError the SDK throws, after one attempt.
    assertIdentical(error.name, "AbortError");
    assertIdentical(error.message, "Request aborted");
    assertIdentical(error.cause, signal.reason);
    assertObjectMatches(error, { $metadata: { attempts: 1 } });
  });

  it("rejects a Converse allowed no time by its timeout signal", async () => {
    // Given an intercepted Bedrock Runtime client with an answer declared.
    const simAws = new SimAws({ defaultRegionName: regionName });
    using simSdk = new SimSdk({ simAws });
    simSdk.intercept(BedrockRuntimeClient);
    simAws.bedrock().responses().byDefault({ text: "yes" });
    const client = new BedrockRuntimeClient({ region: regionName });

    // When a conversation is sent with a timeout of zero milliseconds.
    const error = await assertThrowsErrorAsync(async () => {
      await client.send(converse(), { abortSignal: AbortSignal.timeout(0) });
    });

    // Then the timeout aborts it, as it would a request to Bedrock.
    assertIdentical(error.name, "AbortError");
    assertInstanceOf(error.cause, Error);
    assertIdentical(error.cause.name, "TimeoutError");
  });

  it("answers a Converse whose signal does not fire", async () => {
    // Given an intercepted Bedrock Runtime client with an answer declared.
    const simAws = new SimAws({ defaultRegionName: regionName });
    using simSdk = new SimSdk({ simAws });
    simSdk.intercept(BedrockRuntimeClient);
    simAws.bedrock().responses().byDefault({ text: "yes" });
    const client = new BedrockRuntimeClient({ region: regionName });

    // When a conversation is sent with a signal allowing it a minute.
    const output = await client.send(converse(), {
      abortSignal: AbortSignal.timeout(60_000),
    });

    // Then the declared answer arrives.
    assertIdentical(output.output?.message?.content?.[0]?.text, "yes");
  });

  it("never sends a request whose signal fired to an intercepted instance", async () => {
    // Given an intercepted S3 client instance and a bucket.
    using simSdk = new SimSdk();
    const client = new S3Client({ region: regionName });
    simSdk.intercept(client);
    const bucketName = `uploads-${faker.string.uuid()}`;
    await client.send(new CreateBucketCommand({ Bucket: bucketName }));

    // When an object is put with a signal that has already fired.
    const key = faker.system.fileName();
    const putting = client.send(
      new PutObjectCommand({ Bucket: bucketName, Key: key, Body: "content" }),
      { abortSignal: AbortSignal.abort() },
    );

    // Then the put is refused and the object was never written.
    const error = await assertThrowsErrorAsync(async () => {
      await putting;
    });
    assertIdentical(error.name, "AbortError");
    const missing = await assertThrowsErrorAsync(async () => {
      await client.send(
        new HeadObjectCommand({ Bucket: bucketName, Key: key }),
      );
    });
    assertIdentical(missing.name, "NotFound");
  });

  it("rejects an Invoke when its signal fires while the handler sleeps", async () => {
    // Given an intercepted Lambda client and a function whose handler sleeps
    // for a minute of simulated time.
    const simAws = new SimAws({ defaultRegionName: regionName });
    using simSdk = new SimSdk({ simAws });
    simSdk.intercept(LambdaClient);
    const client = new LambdaClient({ region: regionName });
    const functionName = `sleeper-${faker.string.alphanumeric(8)}`;
    const handlerStarted = Promise.withResolvers();
    await client.send(
      new CreateFunctionCommand({
        FunctionName: functionName,
        Role: "arn:aws:iam::111111111111:role/SleeperRole",
        Timeout: 120,
        Code: {
          ZipFile: makeLambdaZipFileInput(async () => {
            handlerStarted.resolve(undefined);
            await new Promise((resolve) => {
              setTimeout(resolve, 60_000);
            });

            return "awake";
          }),
        },
      }),
    );
    await simAws.backgroundTasksComplete();

    // When it is invoked, and the signal fires while the handler sleeps.
    const controller = new AbortController();
    const invoking = client.send(
      new InvokeCommand({ FunctionName: functionName }),
      { abortSignal: controller.signal },
    );
    await handlerStarted.promise;
    controller.abort();

    // Then the Invoke rejects without waiting for the handler.
    const error = await assertThrowsErrorAsync(async () => {
      await invoking;
    });
    assertIdentical(error.name, "AbortError");
    await simAws.clock().advanceBy({ minutes: 2 });
  });
});

import {
  CreateFunctionCommand,
  CreateFunctionUrlConfigCommand,
  DeleteFunctionUrlConfigCommand,
  GetFunctionUrlConfigCommand,
  LambdaClient,
  ListFunctionUrlConfigsCommand,
  UpdateFunctionUrlConfigCommand,
} from "@aws-sdk/client-lambda";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimSdk } from "../../../sdk/index.js";
import { SimLambdaResourceNotFoundException } from "../error/sim-lambda.error.js";
import { makeLambdaZipFileInput } from "../function/code/lambda-zip-file-input.js";

describe("simulated Lambda Function URL SDK Command routing", () => {
  it("round-trips Function URL Commands through an intercepted client", async () => {
    // Given an intercepted Lambda client with a function.
    using simSdk = new SimSdk();
    const client = new LambdaClient({ region: "eu-west-2" });
    simSdk.intercept(client);

    await client.send(
      new CreateFunctionCommand({
        FunctionName: "intercepted",
        Role: "arn:aws:iam::111111111111:role/InterceptedRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => "hello") },
      }),
    );

    // When the Function URL Commands are sent through the client.
    const created = await client.send(
      new CreateFunctionUrlConfigCommand({
        FunctionName: "intercepted",
        AuthType: "NONE",
      }),
    );
    const read = await client.send(
      new GetFunctionUrlConfigCommand({ FunctionName: "intercepted" }),
    );
    const updated = await client.send(
      new UpdateFunctionUrlConfigCommand({
        FunctionName: "intercepted",
        AuthType: "AWS_IAM",
      }),
    );
    const listed = await client.send(
      new ListFunctionUrlConfigsCommand({ FunctionName: "intercepted" }),
    );

    // Then each reaches the simulated Lambda in the client's Region scope.
    assertNonNullable(created.FunctionUrl);
    assertIdentical(read.FunctionUrl, created.FunctionUrl);
    assertIdentical(updated.AuthType, "AWS_IAM");
    assertArrayLength(listed.FunctionUrlConfigs ?? [], 1);
    assertIdentical(
      simSdk.simAws
        .region("eu-west-2")
        .lambda()
        .getSimFunctionUrl("intercepted")?.url,
      created.FunctionUrl,
    );
  });

  it("routes a Function URL deletion through an intercepted client", async () => {
    // Given an intercepted client with a function that has a Function URL.
    using simSdk = new SimSdk();
    const client = new LambdaClient({ region: "eu-west-2" });
    simSdk.intercept(client);

    await client.send(
      new CreateFunctionCommand({
        FunctionName: "intercepted",
        Role: "arn:aws:iam::111111111111:role/InterceptedRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => "hello") },
      }),
    );
    await client.send(
      new CreateFunctionUrlConfigCommand({
        FunctionName: "intercepted",
        AuthType: "NONE",
      }),
    );

    // When the Function URL is deleted through the client.
    await client.send(
      new DeleteFunctionUrlConfigCommand({ FunctionName: "intercepted" }),
    );

    // Then it is gone from the simulated Lambda.
    const error = await assertThrowsErrorAsync(async () => {
      await client.send(
        new GetFunctionUrlConfigCommand({ FunctionName: "intercepted" }),
      );
    });
    assertInstanceOf(error, SimLambdaResourceNotFoundException);
  });
});

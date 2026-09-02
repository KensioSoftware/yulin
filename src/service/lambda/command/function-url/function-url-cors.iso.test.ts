import {
  CreateFunctionCommand,
  CreateFunctionUrlConfigCommand,
  GetFunctionUrlConfigCommand,
  ListFunctionUrlConfigsCommand,
  UpdateFunctionUrlConfigCommand,
} from "@aws-sdk/client-lambda";
import { faker } from "@faker-js/faker";
import {
  assertArrayEquals,
  assertIdentical,
  assertInstanceOf,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimLambdaValidationException } from "../../error/sim-lambda.error.js";
import { makeLambdaZipFileInput } from "../../function/code/lambda-zip-file-input.js";
import { simLambdaFunctionUrlCorsFactory } from "../../function/url/sim-lambda-function-url-cors.factory.js";
import type { SimLambda } from "../../sim-lambda.js";

describe("Lambda Function URL CORS configuration", () => {
  async function functionWithoutUrl(): Promise<SimLambda> {
    const lambda = new SimAws().lambda();
    await lambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "greeter",
        Role: "arn:aws:iam::111111111111:role/GreeterRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => "hello") },
      }),
    );

    return lambda;
  }

  it("carries every CORS member through create and get", async () => {
    // Given a function and a CORS configuration stating all six members.
    const lambda = await functionWithoutUrl();
    const cors = simLambdaFunctionUrlCorsFactory.make({
      AllowCredentials: true,
      AllowHeaders: ["content-type", "x-api-key"],
      AllowMethods: ["GET", "POST"],
      AllowOrigins: ["https://shop.example.com"],
      ExposeHeaders: ["x-request-id", "x-page-count"],
      MaxAge: 600,
    });

    // When the Function URL is created with it and read back.
    const created = await lambda.createFunctionUrlConfig(
      new CreateFunctionUrlConfigCommand({
        FunctionName: "greeter",
        AuthType: "NONE",
        Cors: cors,
      }),
    );
    const read = await lambda.getFunctionUrlConfig(
      new GetFunctionUrlConfigCommand({ FunctionName: "greeter" }),
    );

    // Then both report the configuration as it was sent.
    assertObjectEquals(created.Cors, cors);
    assertObjectEquals(read.Cors, cors);
  });

  it("lists the CORS configuration a Function URL was given", async () => {
    // Given a Function URL configured to expose a header to one Origin.
    const lambda = await functionWithoutUrl();
    await lambda.createFunctionUrlConfig(
      new CreateFunctionUrlConfigCommand({
        FunctionName: "greeter",
        AuthType: "NONE",
        Cors: simLambdaFunctionUrlCorsFactory.make({
          AllowOrigins: ["https://shop.example.com"],
          ExposeHeaders: ["x-request-id"],
        }),
      }),
    );

    // When the function's Function URL configurations are listed.
    const listed = await lambda.listFunctionUrlConfigs(
      new ListFunctionUrlConfigsCommand({ FunctionName: "greeter" }),
    );

    // Then the one configuration carries the CORS block.
    const [configuration] = listed.FunctionUrlConfigs;
    assertArrayEquals(configuration?.Cors?.AllowOrigins, [
      "https://shop.example.com",
    ]);
    assertArrayEquals(configuration.Cors.ExposeHeaders, ["x-request-id"]);
  });

  it("reports no CORS block for a URL created without one", async () => {
    // Given a Function URL created without CORS.
    const lambda = await functionWithoutUrl();

    // When it is created and read back.
    const created = await lambda.createFunctionUrlConfig(
      new CreateFunctionUrlConfigCommand({
        FunctionName: "greeter",
        AuthType: "NONE",
      }),
    );

    // Then nothing is reported. An empty block would decide headers of its
    // own.
    assertUndefined(created.Cors);
  });

  it("replaces the whole CORS block on update", async () => {
    // Given a Function URL allowing one Origin and one method.
    const lambda = await functionWithoutUrl();
    await lambda.createFunctionUrlConfig(
      new CreateFunctionUrlConfigCommand({
        FunctionName: "greeter",
        AuthType: "NONE",
        Cors: simLambdaFunctionUrlCorsFactory.make({
          AllowOrigins: ["https://shop.example.com"],
          AllowMethods: ["GET"],
        }),
      }),
    );

    // When it is updated with a block naming only the Origins.
    const updated = await lambda.updateFunctionUrlConfig(
      new UpdateFunctionUrlConfigCommand({
        FunctionName: "greeter",
        Cors: { AllowOrigins: ["https://admin.example.com"] },
      }),
    );

    // Then the new block is the whole configuration. The methods the URL was
    // created with went with the block that held them.
    assertArrayEquals(updated.Cors?.AllowOrigins, [
      "https://admin.example.com",
    ]);
    assertUndefined(updated.Cors.AllowMethods);
  });

  it("keeps the CORS block an update leaves out", async () => {
    // Given a Function URL with a CORS configuration.
    const lambda = await functionWithoutUrl();
    await lambda.createFunctionUrlConfig(
      new CreateFunctionUrlConfigCommand({
        FunctionName: "greeter",
        AuthType: "NONE",
        Cors: simLambdaFunctionUrlCorsFactory.make({
          AllowOrigins: ["https://shop.example.com"],
        }),
      }),
    );

    // When only the auth type is updated.
    const updated = await lambda.updateFunctionUrlConfig(
      new UpdateFunctionUrlConfigCommand({
        FunctionName: "greeter",
        AuthType: "AWS_IAM",
      }),
    );

    // Then the CORS configuration is still there.
    assertIdentical(updated.AuthType, "AWS_IAM");
    assertArrayEquals(updated.Cors?.AllowOrigins, ["https://shop.example.com"]);
  });

  it("refuses more allowed origins than Lambda takes", async () => {
    // Given a configuration naming a hundred and one Origins.
    const lambda = await functionWithoutUrl();
    const allowOrigins = faker.helpers.multiple(
      () => `https://${faker.string.alphanumeric(8)}.example.com`,
      { count: 101 },
    );

    // When a Function URL is created with it.
    const error = await assertThrowsErrorAsync(async () => {
      await lambda.createFunctionUrlConfig(
        new CreateFunctionUrlConfigCommand({
          FunctionName: "greeter",
          AuthType: "NONE",
          Cors: simLambdaFunctionUrlCorsFactory.make({
            AllowOrigins: allowOrigins,
          }),
        }),
      );
    });

    // Then it is refused the way Lambda refuses it, naming the member.
    assertInstanceOf(error, SimLambdaValidationException);
    assertStringIncludes(
      error.message,
      "at 'cors.allowOrigins' failed to satisfy constraint: Member must have " +
        "length less than or equal to 100",
    );
  });

  it("refuses an allowed method longer than Lambda takes", async () => {
    // Given a configuration naming OPTIONS, which is longer than the six
    // characters the member allows because Lambda answers preflight itself.
    const lambda = await functionWithoutUrl();

    // When a Function URL is created with it.
    const error = await assertThrowsErrorAsync(async () => {
      await lambda.createFunctionUrlConfig(
        new CreateFunctionUrlConfigCommand({
          FunctionName: "greeter",
          AuthType: "NONE",
          Cors: simLambdaFunctionUrlCorsFactory.make({
            AllowMethods: ["OPTIONS"],
          }),
        }),
      );
    });

    // Then the refusal names the member and the bound it broke.
    assertStringIncludes(
      error.message,
      "Value '[OPTIONS]' at 'cors.allowMethods' failed to satisfy constraint: " +
        "Member must satisfy constraint: [Member must have length less than " +
        "or equal to 6, Member must have length greater than or equal to 0]",
    );
  });

  it("refuses a maximum age outside the range Lambda takes", async () => {
    // Given a function.
    const lambda = await functionWithoutUrl();

    // When a Function URL is created with a day and a second of caching.
    const tooLong = await assertThrowsErrorAsync(async () => {
      await lambda.createFunctionUrlConfig(
        new CreateFunctionUrlConfigCommand({
          FunctionName: "greeter",
          AuthType: "NONE",
          Cors: simLambdaFunctionUrlCorsFactory.make({ MaxAge: 86_401 }),
        }),
      );
    });

    // And when one is created with a negative age.
    const negative = await assertThrowsErrorAsync(async () => {
      await lambda.createFunctionUrlConfig(
        new CreateFunctionUrlConfigCommand({
          FunctionName: "greeter",
          AuthType: "NONE",
          Cors: simLambdaFunctionUrlCorsFactory.make({ MaxAge: -1 }),
        }),
      );
    });

    // Then both are refused against the bound they broke.
    assertStringIncludes(
      tooLong.message,
      "at 'cors.maxAge' failed to satisfy constraint: Member must have value " +
        "less than or equal to 86400",
    );
    assertStringIncludes(
      negative.message,
      "at 'cors.maxAge' failed to satisfy constraint: Member must have value " +
        "greater than or equal to 0",
    );
  });

  it("leaves the configuration alone when an update is refused", async () => {
    // Given a Function URL allowing one Origin.
    const lambda = await functionWithoutUrl();
    await lambda.createFunctionUrlConfig(
      new CreateFunctionUrlConfigCommand({
        FunctionName: "greeter",
        AuthType: "NONE",
        Cors: simLambdaFunctionUrlCorsFactory.make({
          AllowOrigins: ["https://shop.example.com"],
        }),
      }),
    );

    // When an update states an auth type alongside a CORS block Lambda refuses.
    await assertThrowsErrorAsync(async () => {
      await lambda.updateFunctionUrlConfig(
        new UpdateFunctionUrlConfigCommand({
          FunctionName: "greeter",
          AuthType: "AWS_IAM",
          Cors: { MaxAge: 90_000 },
        }),
      );
    });

    // Then nothing about the URL changed. The auth type stayed where it was
    // alongside the CORS block.
    const read = await lambda.getFunctionUrlConfig(
      new GetFunctionUrlConfigCommand({ FunctionName: "greeter" }),
    );
    assertIdentical(read.AuthType, "NONE");
    assertArrayEquals(read.Cors?.AllowOrigins, ["https://shop.example.com"]);
  });

  it("refuses an allowed origin longer than Lambda takes", async () => {
    // Given a configuration naming an Origin over 253 characters.
    const lambda = await functionWithoutUrl();
    const origin = `https://${faker.string.alphanumeric(250)}.example.com`;

    // When a Function URL is created with it.
    const error = await assertThrowsErrorAsync(async () => {
      await lambda.createFunctionUrlConfig(
        new CreateFunctionUrlConfigCommand({
          FunctionName: "greeter",
          AuthType: "NONE",
          Cors: simLambdaFunctionUrlCorsFactory.make({
            AllowOrigins: [origin],
          }),
        }),
      );
    });

    // Then the refusal names the length bound the member broke.
    assertStringIncludes(
      error.message,
      "at 'cors.allowOrigins' failed to satisfy constraint: Member must " +
        "satisfy constraint: [Member must have length less than or equal to " +
        "253, Member must have length greater than or equal to 1]",
    );
  });
});

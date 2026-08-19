import {
  CreateFunctionCommand,
  GetFunctionCommand,
  PublishVersionCommand,
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
import { SimLambda } from "../../sim-lambda.js";
import { SimLambdaResourceNotFoundException } from "../../error/sim-lambda.error.js";
import { makeLambdaZipFileInput } from "../../function/code/lambda-zip-file-input.js";

describe("Lambda GetFunctionCommand", () => {
  it("gets an existing function's configuration", async () => {
    const simLambda = new SimLambda();
    const roleArn = "arn:aws:iam::111111111111:role/GetterRole";
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "gettable",
        Role: roleArn,
        Handler: "index.handler",
        Runtime: "nodejs22.x",
        Code: {
          ZipFile: makeLambdaZipFileInput(() => null),
        },
      }),
    );

    const output = await simLambda.getFunction(
      new GetFunctionCommand({ FunctionName: "gettable" }),
    );

    assertIdentical(output.Configuration.FunctionName, "gettable");
    assertIdentical(output.Configuration.Role, roleArn);
    assertIdentical(output.Configuration.Handler, "index.handler");
    assertIdentical(output.Configuration.Runtime, "nodejs22.x");
  });

  it("throws on a function that does not exist", async () => {
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .lambda()
        .getFunction(new GetFunctionCommand({ FunctionName: "missing" })),
    );

    assertInstanceOf(error, SimLambdaResourceNotFoundException);
    assertStringIncludes(
      error.message,
      `arn:aws:lambda:${simAws.defaultRegionName}:` +
        `${simAws.defaultAccountId}:function:missing`,
    );
  });

  it("denies an explicitly anonymous caller through sim IAM", async () => {
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .lambda()
        .getFunction(new GetFunctionCommand({ FunctionName: "anything" }), {
          caller: { kind: "anonymous" },
        }),
    );

    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "lambda:GetFunction");
  });

  it("gets a published version's configuration for a Qualifier", async () => {
    // Given a function with a published version.
    const simLambda = new SimLambda();
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "orders",
        Role: "arn:aws:iam::111111111111:role/OrdersRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => null) },
      }),
    );
    await simLambda.publishVersion(
      new PublishVersionCommand({ FunctionName: "orders" }),
    );

    // When the function is read for that version.
    const fetched = await simLambda.getFunction(
      new GetFunctionCommand({ FunctionName: "orders", Qualifier: "1" }),
    );

    // Then the version's own configuration comes back, under its own ARN.
    assertIdentical(fetched.Configuration.Version, "1");
    assertStringIncludes(
      fetched.Configuration.FunctionArn,
      ":function:orders:1",
    );
  });

  it("reads a version off a qualified function ARN", async () => {
    // Given a function with a published version.
    const simLambda = new SimLambda();
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "orders",
        Role: "arn:aws:iam::111111111111:role/OrdersRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => null) },
      }),
    );
    await simLambda.publishVersion(
      new PublishVersionCommand({ FunctionName: "orders" }),
    );
    const { Configuration } = await simLambda.getFunction(
      new GetFunctionCommand({ FunctionName: "orders" }),
    );

    // When the function is read by an ARN naming that version.
    const fetched = await simLambda.getFunction(
      new GetFunctionCommand({
        FunctionName: `${Configuration.FunctionArn}:1`,
      }),
    );

    // Then it resolves the same way a Qualifier does.
    assertIdentical(fetched.Configuration.Version, "1");
    assertStringIncludes(
      fetched.Configuration.FunctionArn,
      ":function:orders:1",
    );
  });

  it("throws on a Qualifier naming no version or alias", async () => {
    // Given a function with nothing published.
    const simLambda = new SimLambda();
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "orders",
        Role: "arn:aws:iam::111111111111:role/OrdersRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => null) },
      }),
    );

    // When the function is read for a version nothing published.
    const error = await assertThrowsErrorAsync(async () =>
      simLambda.getFunction(
        new GetFunctionCommand({ FunctionName: "orders", Qualifier: "3" }),
      ),
    );

    // Then the qualified function is what gets reported as missing.
    assertInstanceOf(error, SimLambdaResourceNotFoundException);
    assertStringIncludes(error.message, ":function:orders:3");
  });

  it("throws on undefined function name", async () => {
    const simLambda = new SimLambda();

    const error = await assertThrowsErrorAsync(async () =>
      simLambda.getFunction(
        new GetFunctionCommand({ FunctionName: undefined }),
      ),
    );

    assertStringIncludes(
      error.message,
      "GetFunctionCommand.input.FunctionName required",
    );
  });
});

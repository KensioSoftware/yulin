import {
  AddPermissionCommand,
  CreateAliasCommand,
  CreateFunctionCommand,
  CreateFunctionUrlConfigCommand,
  GetFunctionUrlConfigCommand,
  GetPolicyCommand,
  InvokeCommand,
  ListVersionsByFunctionCommand,
  PublishVersionCommand,
  UpdateFunctionCodeCommand,
} from "@aws-sdk/client-lambda";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../function/code/lambda-zip-file-input.js";
import { SimLambda } from "../../sim-lambda.js";

function parsePayload(payload: Uint8Array | undefined): unknown {
  assertNonNullable(payload);
  return JSON.parse(Buffer.from(payload).toString()) as unknown;
}

describe("Lambda UpdateFunctionCodeCommand and published versions", () => {
  it("leaves a version published beforehand running its own code", async () => {
    // Given a function with a version published from its first code.
    const simLambda = new SimLambda();
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "orders",
        Role: "arn:aws:iam::111111111111:role/OrdersRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => "first") },
      }),
    );
    await simLambda.publishVersion(
      new PublishVersionCommand({ FunctionName: "orders" }),
    );

    // When the function's code is replaced.
    await simLambda.updateFunctionCode(
      new UpdateFunctionCodeCommand({
        FunctionName: "orders",
        ZipFile: makeLambdaZipFileInput(() => "second"),
      }),
    );

    // Then $LATEST runs the replacement while version 1 runs what it was
    // published with.
    const latest = await simLambda.invoke(
      new InvokeCommand({ FunctionName: "orders" }),
    );
    const version = await simLambda.invoke(
      new InvokeCommand({ FunctionName: "orders", Qualifier: "1" }),
    );
    assertIdentical(parsePayload(latest.Payload), "second");
    assertIdentical(parsePayload(version.Payload), "first");
  });

  it("publishes a version of the replacement code when asked to", async () => {
    // Given a function whose code is about to be replaced.
    const simLambda = new SimLambda();
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "orders",
        Role: "arn:aws:iam::111111111111:role/OrdersRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => "first") },
      }),
    );

    // When the update asks for a version.
    const published = await simLambda.updateFunctionCode(
      new UpdateFunctionCodeCommand({
        FunctionName: "orders",
        ZipFile: makeLambdaZipFileInput(() => "second"),
        Publish: true,
      }),
    );

    // Then the answer is that version, and it runs the replacement code.
    assertIdentical(published.Version, "1");
    assertStringIncludes(published.FunctionArn, ":function:orders:1");
    const invoked = await simLambda.invoke(
      new InvokeCommand({ FunctionName: "orders", Qualifier: "1" }),
    );
    assertIdentical(parsePayload(invoked.Payload), "second");
  });

  it("answers with $LATEST when the update asks for no version", async () => {
    // Given a function whose code is about to be replaced.
    const simLambda = new SimLambda();
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "orders",
        Role: "arn:aws:iam::111111111111:role/OrdersRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => "first") },
      }),
    );

    // When the update leaves Publish out.
    const updated = await simLambda.updateFunctionCode(
      new UpdateFunctionCodeCommand({
        FunctionName: "orders",
        ZipFile: makeLambdaZipFileInput(() => "second"),
      }),
    );

    // Then nothing was published.
    assertIdentical(updated.Version, "$LATEST");
    const versions = await simLambda.listVersionsByFunction(
      new ListVersionsByFunctionCommand({ FunctionName: "orders" }),
    );
    assertArrayLength(versions.Versions, 1);
  });

  it("keeps an alias pointing at the version it already pointed at", async () => {
    // Given an alias on a version published from the function's first code.
    const simLambda = new SimLambda();
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "orders",
        Role: "arn:aws:iam::111111111111:role/OrdersRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => "first") },
      }),
    );
    await simLambda.publishVersion(
      new PublishVersionCommand({ FunctionName: "orders" }),
    );
    await simLambda.createAlias(
      new CreateAliasCommand({
        FunctionName: "orders",
        Name: "live",
        FunctionVersion: "1",
      }),
    );

    // When the function's code is replaced.
    await simLambda.updateFunctionCode(
      new UpdateFunctionCodeCommand({
        FunctionName: "orders",
        ZipFile: makeLambdaZipFileInput(() => "second"),
      }),
    );

    // Then the alias still reaches the code its version was published with.
    const invoked = await simLambda.invoke(
      new InvokeCommand({ FunctionName: "orders", Qualifier: "live" }),
    );
    assertIdentical(parsePayload(invoked.Payload), "first");
  });

  it("keeps the function's resource policy and Function URL", async () => {
    // Given a function with a Function URL and a resource-based grant.
    const simAws = new SimAws();
    const lambda = simAws.lambda();
    await lambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "orders",
        Role: "arn:aws:iam::111111111111:role/OrdersRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => "first") },
      }),
    );
    const created = await lambda.createFunctionUrlConfig(
      new CreateFunctionUrlConfigCommand({
        FunctionName: "orders",
        AuthType: "NONE",
      }),
    );
    await lambda.addPermission(
      new AddPermissionCommand({
        FunctionName: "orders",
        StatementId: "public-invoke",
        Action: "lambda:InvokeFunction",
        Principal: "*",
      }),
    );

    // When the function's code is replaced.
    await lambda.updateFunctionCode(
      new UpdateFunctionCodeCommand({
        FunctionName: "orders",
        ZipFile: makeLambdaZipFileInput(() => "second"),
      }),
    );

    // Then both survive, unlike deleting the function and creating it again.
    const url = await lambda.getFunctionUrlConfig(
      new GetFunctionUrlConfigCommand({ FunctionName: "orders" }),
    );
    const policy = await lambda.getPolicy(
      new GetPolicyCommand({ FunctionName: "orders" }),
    );
    assertIdentical(url.FunctionUrl, created.FunctionUrl);
    assertStringIncludes(policy.Policy, "public-invoke");
  });
});

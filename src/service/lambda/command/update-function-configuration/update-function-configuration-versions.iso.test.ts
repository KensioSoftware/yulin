import {
  AddPermissionCommand,
  CreateFunctionCommand,
  CreateFunctionUrlConfigCommand,
  GetFunctionCommand,
  GetFunctionUrlConfigCommand,
  GetPolicyCommand,
  InvokeCommand,
  PublishVersionCommand,
  UpdateFunctionConfigurationCommand,
} from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertNonNullable,
  assertObjectEquals,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { makeLambdaCodeZip } from "../../function/code/make-lambda-code-zip.js";
import { makeLambdaZipFileInput } from "../../function/code/lambda-zip-file-input.js";
import { SimLambda } from "../../sim-lambda.js";

function parsePayload(payload: Uint8Array | undefined): unknown {
  assertNonNullable(payload);
  return JSON.parse(Buffer.from(payload).toString()) as unknown;
}

async function createOrdersFunction(simLambda: SimLambda): Promise<void> {
  await simLambda.createFunction(
    new CreateFunctionCommand({
      FunctionName: "orders",
      Role: "arn:aws:iam::111111111111:role/OrdersRole",
      Code: { ZipFile: makeLambdaZipFileInput(() => "handled") },
      MemorySize: 512,
      Timeout: 30,
      Environment: { Variables: { STAGE: "live" } },
    }),
  );
}

describe("Lambda UpdateFunctionConfigurationCommand and published versions", () => {
  it("leaves a version published beforehand with its own settings", async () => {
    // Given a function with a version published from its first settings.
    const simLambda = new SimLambda();
    await createOrdersFunction(simLambda);
    await simLambda.publishVersion(
      new PublishVersionCommand({ FunctionName: "orders" }),
    );

    // When the function's settings are changed.
    await simLambda.updateFunctionConfiguration(
      new UpdateFunctionConfigurationCommand({
        FunctionName: "orders",
        MemorySize: 1024,
        Timeout: 5,
        Environment: { Variables: { STAGE: "test" } },
      }),
    );

    // Then version 1 reports what it was published with.
    const published = await simLambda.getFunction(
      new GetFunctionCommand({ FunctionName: "orders", Qualifier: "1" }),
    );
    assertIdentical(published.Configuration.MemorySize, 512);
    assertIdentical(published.Configuration.Timeout, 30);
    assertObjectEquals(published.Configuration.Environment?.Variables ?? {}, {
      STAGE: "live",
    });
  });

  it("publishes the settings the function has when the version is taken", async () => {
    // Given a function whose settings changed after it was created.
    const simLambda = new SimLambda();
    await createOrdersFunction(simLambda);
    await simLambda.updateFunctionConfiguration(
      new UpdateFunctionConfigurationCommand({
        FunctionName: "orders",
        MemorySize: 1024,
        Timeout: 5,
        Environment: { Variables: { STAGE: "test" } },
      }),
    );

    // When a version is published afterwards.
    const published = await simLambda.publishVersion(
      new PublishVersionCommand({ FunctionName: "orders" }),
    );

    // Then it carries the changed settings rather than the original ones.
    assertIdentical(published.MemorySize, 1024);
    assertIdentical(published.Timeout, 5);
    assertObjectEquals(published.Environment?.Variables ?? {}, {
      STAGE: "test",
    });
  });

  it("keeps the function's resource policy and Function URL", async () => {
    // Given a function with a Function URL and a resource-based grant.
    const simAws = new SimAws();
    const lambda = simAws.lambda();
    await createOrdersFunction(lambda);
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

    // When the function's settings change.
    await lambda.updateFunctionConfiguration(
      new UpdateFunctionConfigurationCommand({
        FunctionName: "orders",
        Timeout: 5,
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

  it("keeps the code the function runs", async () => {
    // Given a function backed by a real in-process handler.
    const simLambda = new SimLambda();
    await createOrdersFunction(simLambda);

    // When its settings change.
    await simLambda.updateFunctionConfiguration(
      new UpdateFunctionConfigurationCommand({
        FunctionName: "orders",
        Timeout: 5,
      }),
    );

    // Then the same handler still runs.
    const invoked = await simLambda.invoke(
      new InvokeCommand({ FunctionName: "orders" }),
    );
    assertIdentical(parsePayload(invoked.Payload), "handled");
  });

  it("runs a changed Handler's export from the same code archive", async () => {
    // Given zip code exporting two handlers, running under the first.
    const simAws = new SimAws();
    const lambda = simAws.lambda();
    await lambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "orders",
        Role: `arn:aws:iam::${simAws.defaultAccountId}:role/OrdersRole`,
        Handler: "index.take",
        Runtime: "nodejs22.x",
        Code: {
          ZipFile: makeLambdaCodeZip(
            "exports.take = async () => 'taking';" +
              "exports.read = async () => 'reading';",
          ),
        },
      }),
    );
    const first = await lambda.invoke(
      new InvokeCommand({ FunctionName: "orders" }),
    );
    assertIdentical(parsePayload(first.Payload), "taking");

    // When the Handler is pointed at the other export.
    await lambda.updateFunctionConfiguration(
      new UpdateFunctionConfigurationCommand({
        FunctionName: "orders",
        Handler: "index.read",
      }),
    );

    // Then the next invocation runs that one, from the archive already there.
    const second = await lambda.invoke(
      new InvokeCommand({ FunctionName: "orders" }),
    );
    assertIdentical(parsePayload(second.Payload), "reading");

    await simAws.backgroundTasksComplete();
  });
});

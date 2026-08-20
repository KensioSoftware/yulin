import {
  CreateFunctionCommand,
  DeleteFunctionCommand,
  GetFunctionCommand,
  InvokeCommand,
  LambdaClient,
  ListFunctionsCommand,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
  GetFunctionConfigurationCommand,
} from "@aws-sdk/client-lambda";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimSdk } from "../../../sdk/index.js";
import type { SimAwsPrincipal } from "../../aws/caller/sim-aws-caller.js";
import { simAwsRunAsContext } from "../../aws/caller/sim-aws-run-as-context.js";
import { makeLambdaZipFileInput } from "../function/code/lambda-zip-file-input.js";

describe("simulated Lambda SDK Command routing", () => {
  it("round-trips function Commands through an intercepted client", async () => {
    using simSdk = new SimSdk();
    const client = new LambdaClient({ region: "eu-west-2" });
    simSdk.intercept(client);

    const creation = await client.send(
      new CreateFunctionCommand({
        FunctionName: "intercepted",
        Role: "arn:aws:iam::111111111111:role/InterceptedRole",
        Code: {
          ZipFile: makeLambdaZipFileInput((event: { name: string }) => ({
            greeting: `Hello ${event.name}`,
          })),
        },
      }),
    );
    assertIdentical(creation.FunctionName, "intercepted");
    await simSdk.simAws.backgroundTasksComplete();

    const functionFetch = await client.send(
      new GetFunctionCommand({ FunctionName: "intercepted" }),
    );
    assertIdentical(functionFetch.Configuration?.State, "Active");

    const invokeOutput = await client.send(
      new InvokeCommand({
        FunctionName: "intercepted",
        Payload: JSON.stringify({ name: "interceptor" }),
      }),
    );
    assertIdentical(invokeOutput.StatusCode, 200);
    assertNonNullable(invokeOutput.Payload);
    assertObjectEquals(
      JSON.parse(Buffer.from(invokeOutput.Payload).toString()) as object,
      { greeting: "Hello interceptor" },
    );

    // And the intercepted function is in the client Region's simulated scope.
    const directGetOutput = await simSdk.simAws
      .region("eu-west-2")
      .lambda()
      .getFunction(new GetFunctionCommand({ FunctionName: "intercepted" }));
    assertIdentical(directGetOutput.Configuration.FunctionName, "intercepted");

    // And deleting it through the client takes it out of that scope.
    await client.send(
      new DeleteFunctionCommand({ FunctionName: "intercepted" }),
    );
    const deletedError = await assertThrowsErrorAsync(async () =>
      client.send(new GetFunctionCommand({ FunctionName: "intercepted" })),
    );
    assertStringIncludes(deletedError.message, "Function not found");
  });

  it("attributes handler execution to the function's execution Role", async () => {
    using simSdk = new SimSdk();
    const client = new LambdaClient({ region: "eu-west-2" });
    simSdk.intercept(client);

    const executionRoleArn = "arn:aws:iam::111111111111:role/ExecutionRole";
    let observedCaller: SimAwsPrincipal | undefined;
    await client.send(
      new CreateFunctionCommand({
        FunctionName: "who-am-i",
        Role: executionRoleArn,
        Code: {
          ZipFile: makeLambdaZipFileInput(() => {
            observedCaller = simAwsRunAsContext.currentCaller(simSdk.simAws);
            return null;
          }),
        },
      }),
    );

    await client.send(new InvokeCommand({ FunctionName: "who-am-i" }));

    // The ambient caller during handler execution is the execution Role, so
    // intercepted SDK Commands sent by the handler are attributed to it.
    assertObjectEquals(observedCaller as unknown as object, {
      kind: "arn",
      arn: executionRoleArn,
    });

    await simSdk.simAws.backgroundTasksComplete();
  });

  it("routes the function update and listing Commands through an intercepted client", async () => {
    using simSdk = new SimSdk();
    const client = new LambdaClient({ region: "eu-west-2" });
    simSdk.intercept(client);

    await client.send(
      new CreateFunctionCommand({
        FunctionName: "intercepted",
        Role: "arn:aws:iam::111111111111:role/InterceptedRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => "first") },
      }),
    );
    await client.send(
      new UpdateFunctionCodeCommand({
        FunctionName: "intercepted",
        ZipFile: makeLambdaZipFileInput(() => "second"),
      }),
    );

    const invoked = await client.send(
      new InvokeCommand({ FunctionName: "intercepted" }),
    );
    assertNonNullable(invoked.Payload);
    assertIdentical(Buffer.from(invoked.Payload).toString(), '"second"');

    await client.send(
      new UpdateFunctionConfigurationCommand({
        FunctionName: "intercepted",
        Timeout: 5,
      }),
    );

    const listed = await client.send(new ListFunctionsCommand({}));
    assertNonNullable(listed.Functions);
    assertArrayLength(listed.Functions, 1);
    assertIdentical(listed.Functions[0].FunctionName, "intercepted");
    assertIdentical(listed.Functions[0].Timeout, 5);

    await simSdk.simAws.backgroundTasksComplete();
  });

  it("rejects a Command simulated Lambda does not support", async () => {
    using simSdk = new SimSdk();
    const client = new LambdaClient({ region: "eu-west-2" });
    simSdk.intercept(client);

    const error = await assertThrowsErrorAsync(async () => {
      await client.send(
        new GetFunctionConfigurationCommand({ FunctionName: "orders" }),
      );
    });

    assertStringIncludes(error.message, "GetFunctionConfigurationCommand");
    assertStringIncludes(error.message, "InvokeCommand");
  });
});

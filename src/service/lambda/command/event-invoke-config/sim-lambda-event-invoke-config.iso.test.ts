import {
  DeleteFunctionCommand,
  DeleteFunctionEventInvokeConfigCommand,
  GetFunctionEventInvokeConfigCommand,
  ListFunctionEventInvokeConfigsCommand,
  PublishVersionCommand,
  PutFunctionEventInvokeConfigCommand,
  UpdateFunctionEventInvokeConfigCommand,
} from "@aws-sdk/client-lambda";
import {
  assertArrayLength,
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  simAwsWithAsyncFunction,
  simLambdaAsyncFunctionName,
  simLambdaQueueArn,
} from "../../../../../test/lambda/async-destination-fixture.js";
import { SimAws } from "../../../aws/sim-aws.js";

const failuresArn = simLambdaQueueArn("failures");
const resultsArn = simLambdaQueueArn("results");

describe("Lambda event invoke config commands", () => {
  it("writes a config and reads it back with the defaults filled in", async () => {
    // Given a function.
    const { simAws } = await simAwsWithAsyncFunction();

    // When a config naming only a failure destination is written.
    await simAws.lambda().putFunctionEventInvokeConfig(
      new PutFunctionEventInvokeConfigCommand({
        FunctionName: simLambdaAsyncFunctionName,
        DestinationConfig: { OnFailure: { Destination: failuresArn } },
      }),
    );

    // Then Get reports it, with the retry settings AWS defaults to.
    const config = await simAws.lambda().getFunctionEventInvokeConfig(
      new GetFunctionEventInvokeConfigCommand({
        FunctionName: simLambdaAsyncFunctionName,
      }),
    );
    assertIdentical(config.MaximumRetryAttempts, 2);
    assertIdentical(config.MaximumEventAgeInSeconds, 21_600);
    assertIdentical(
      config.DestinationConfig.OnFailure?.Destination,
      failuresArn,
    );
  });

  it("changes the settings an update names and leaves the rest", async () => {
    // Given a config with a failure destination and one retry.
    const { simAws } = await simAwsWithAsyncFunction();
    await simAws.lambda().putFunctionEventInvokeConfig(
      new PutFunctionEventInvokeConfigCommand({
        FunctionName: simLambdaAsyncFunctionName,
        MaximumRetryAttempts: 1,
        DestinationConfig: { OnFailure: { Destination: failuresArn } },
      }),
    );

    // When only the success destination is updated.
    const updated = await simAws.lambda().updateFunctionEventInvokeConfig(
      new UpdateFunctionEventInvokeConfigCommand({
        FunctionName: simLambdaAsyncFunctionName,
        DestinationConfig: { OnSuccess: { Destination: resultsArn } },
      }),
    );

    // Then the retry count and the failure destination stand.
    assertIdentical(updated.MaximumRetryAttempts, 1);
    assertIdentical(
      updated.DestinationConfig.OnFailure?.Destination,
      failuresArn,
    );
    assertIdentical(
      updated.DestinationConfig.OnSuccess?.Destination,
      resultsArn,
    );
  });

  it("returns a setting a put leaves out to its default", async () => {
    // Given a config with one retry.
    const { simAws } = await simAwsWithAsyncFunction();
    await simAws.lambda().putFunctionEventInvokeConfig(
      new PutFunctionEventInvokeConfigCommand({
        FunctionName: simLambdaAsyncFunctionName,
        MaximumRetryAttempts: 1,
        DestinationConfig: { OnFailure: { Destination: failuresArn } },
      }),
    );

    // When the config is written again without it.
    const written = await simAws.lambda().putFunctionEventInvokeConfig(
      new PutFunctionEventInvokeConfigCommand({
        FunctionName: simLambdaAsyncFunctionName,
      }),
    );

    // Then the whole config was replaced rather than merged into.
    assertIdentical(written.MaximumRetryAttempts, 2);
    assertUndefined(written.DestinationConfig.OnFailure);
  });

  it("deletes a config, leaving nothing to read", async () => {
    // Given a function with a config.
    const { simAws } = await simAwsWithAsyncFunction();
    await simAws.lambda().putFunctionEventInvokeConfig(
      new PutFunctionEventInvokeConfigCommand({
        FunctionName: simLambdaAsyncFunctionName,
        MaximumRetryAttempts: 0,
      }),
    );

    // When it is deleted.
    await simAws.lambda().deleteFunctionEventInvokeConfig(
      new DeleteFunctionEventInvokeConfigCommand({
        FunctionName: simLambdaAsyncFunctionName,
      }),
    );

    // Then reading it fails as AWS fails.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.lambda().getFunctionEventInvokeConfig(
        new GetFunctionEventInvokeConfigCommand({
          FunctionName: simLambdaAsyncFunctionName,
        }),
      );
    });
    assertStringIncludes(error.message, "doesn't have an EventInvokeConfig");
  });

  it("lists the config of each qualifier a function holds", async () => {
    // Given a function with a config of its own and one on a version.
    const { simAws } = await simAwsWithAsyncFunction();
    await simAws.lambda().publishVersion(
      new PublishVersionCommand({
        FunctionName: simLambdaAsyncFunctionName,
      }),
    );
    await simAws.lambda().putFunctionEventInvokeConfig(
      new PutFunctionEventInvokeConfigCommand({
        FunctionName: simLambdaAsyncFunctionName,
        MaximumRetryAttempts: 0,
      }),
    );
    await simAws.lambda().putFunctionEventInvokeConfig(
      new PutFunctionEventInvokeConfigCommand({
        FunctionName: simLambdaAsyncFunctionName,
        Qualifier: "1",
        MaximumRetryAttempts: 1,
      }),
    );

    // When the function's configs are listed.
    const listed = await simAws.lambda().listFunctionEventInvokeConfigs(
      new ListFunctionEventInvokeConfigsCommand({
        FunctionName: simLambdaAsyncFunctionName,
      }),
    );

    // Then both are there.
    assertArrayLength(listed.FunctionEventInvokeConfigs, 2);
  });

  it("forgets a function's configs when the function goes", async () => {
    // Given a function with a config.
    const { simAws } = await simAwsWithAsyncFunction();
    await simAws.lambda().putFunctionEventInvokeConfig(
      new PutFunctionEventInvokeConfigCommand({
        FunctionName: simLambdaAsyncFunctionName,
        MaximumRetryAttempts: 0,
      }),
    );

    // When the function is deleted and made again.
    await simAws.lambda().deleteFunction(
      new DeleteFunctionCommand({
        FunctionName: simLambdaAsyncFunctionName,
      }),
    );
    const { simAws: remade } = await simAwsWithAsyncFunction();

    // Then the new function starts without one.
    const error = await assertThrowsErrorAsync(async () => {
      await remade.lambda().getFunctionEventInvokeConfig(
        new GetFunctionEventInvokeConfigCommand({
          FunctionName: simLambdaAsyncFunctionName,
        }),
      );
    });
    assertStringIncludes(error.message, "doesn't have an EventInvokeConfig");
  });

  it("refuses more retries than real Lambda makes", async () => {
    // Given a function.
    const { simAws } = await simAwsWithAsyncFunction();

    // When a config asks for three retries.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.lambda().putFunctionEventInvokeConfig(
        new PutFunctionEventInvokeConfigCommand({
          FunctionName: simLambdaAsyncFunctionName,
          MaximumRetryAttempts: 3,
        }),
      );
    });

    // Then it is refused.
    assertStringIncludes(
      error.message,
      "MaximumRetryAttempts must be a whole number between 0 and 2",
    );
  });

  it("refuses a destination this simulation cannot send to", async () => {
    // Given a function.
    const { simAws } = await simAwsWithAsyncFunction();

    // When a config names a destination in a service that is not one.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.lambda().putFunctionEventInvokeConfig(
        new PutFunctionEventInvokeConfigCommand({
          FunctionName: simLambdaAsyncFunctionName,
          DestinationConfig: {
            OnFailure: {
              Destination: "arn:aws:s3:us-east-1:888888888888:failures",
            },
          },
        }),
      );
    });

    // Then it is refused while the caller is there to see it.
    assertStringIncludes(error.message, "names s3");
  });

  it("fails for a function that does not exist", async () => {
    // Given a simulated AWS with no functions.
    const simAws = new SimAws();

    // When a config is written for one.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .lambda()
        .putFunctionEventInvokeConfig(
          new PutFunctionEventInvokeConfigCommand({ FunctionName: "missing" }),
        );
    });

    // Then it fails as AWS fails.
    assertStringIncludes(error.message, "Function not found");
  });
});

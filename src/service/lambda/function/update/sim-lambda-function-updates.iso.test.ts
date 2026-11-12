import {
  CreateFunctionCommand,
  GetFunctionConfigurationCommand,
  InvokeCommand,
  LambdaClient,
  PublishVersionCommand,
  TagResourceCommand,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
  waitUntilFunctionUpdatedV2,
} from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertInstanceOf,
  assertNotEqual,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimSdk } from "../../../../sdk/sim-sdk.js";
import {
  SimLambdaPreconditionFailedException,
  SimLambdaResourceConflictException,
} from "../../error/sim-lambda.error.js";
import { makeLambdaZipFileInput } from "../code/lambda-zip-file-input.js";

/**
 * A simulation holding a settled `orders` function, answering with its ARN.
 */
async function settledOrders(simAws: SimAws): Promise<string> {
  const created = await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: "orders",
      Role: "arn:aws:iam::111111111111:role/OrdersRole",
      Code: { ZipFile: makeLambdaZipFileInput(() => "first") },
    }),
  );
  await simAws.backgroundTasksComplete();

  return created.FunctionArn;
}

function timeoutChange(seconds: number): UpdateFunctionConfigurationCommand {
  return new UpdateFunctionConfigurationCommand({
    FunctionName: "orders",
    Timeout: seconds,
  });
}

describe("Lambda LastUpdateStatus", () => {
  it("reports an update InProgress until it has rolled out, then Successful", async () => {
    // Given a settled function.
    const simAws = new SimAws();
    await settledOrders(simAws);

    // When its settings change, and the change rolls out.
    const updating = await simAws
      .lambda()
      .updateFunctionConfiguration(timeoutChange(5));
    await simAws.backgroundTasksComplete();
    const updated = await simAws
      .lambda()
      .getFunctionConfiguration(
        new GetFunctionConfigurationCommand({ FunctionName: "orders" }),
      );

    // Then the update answers InProgress, and reads Successful once settled.
    assertIdentical(updating.LastUpdateStatus, "InProgress");
    assertIdentical(updated.LastUpdateStatus, "Successful");
    assertIdentical(updated.Timeout, 5);
  });

  it("refuses a second change while the first is in progress", async () => {
    // Given a function whose code change is still rolling out.
    const simAws = new SimAws();
    await settledOrders(simAws);
    await simAws.lambda().updateFunctionCode(
      new UpdateFunctionCodeCommand({
        FunctionName: "orders",
        ZipFile: makeLambdaZipFileInput(() => "second"),
      }),
    );

    // When its settings are changed straight away.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.lambda().updateFunctionConfiguration(timeoutChange(5)),
    );

    // Then real Lambda's conflict is reported, and the change succeeds once
    // the first has rolled out.
    assertInstanceOf(error, SimLambdaResourceConflictException);
    await simAws.backgroundTasksComplete();
    const retried = await simAws
      .lambda()
      .updateFunctionConfiguration(timeoutChange(5));
    assertIdentical(retried.Timeout, 5);
    await simAws.backgroundTasksComplete();
  });

  it("refuses to publish or tag a function while an update is in progress", async () => {
    // Given a function whose settings change is still rolling out.
    const simAws = new SimAws();
    const arn = await settledOrders(simAws);
    await simAws.lambda().updateFunctionConfiguration(timeoutChange(5));

    // When a version is published and the function tagged straight away.
    const publishing = await assertThrowsErrorAsync(async () =>
      simAws
        .lambda()
        .publishVersion(new PublishVersionCommand({ FunctionName: "orders" })),
    );
    const tagging = await assertThrowsErrorAsync(async () =>
      simAws
        .lambda()
        .tagResource(
          new TagResourceCommand({ Resource: arn, Tags: { team: "payments" } }),
        ),
    );

    // Then both are refused as real Lambda refuses them.
    assertInstanceOf(publishing, SimLambdaResourceConflictException);
    assertInstanceOf(tagging, SimLambdaResourceConflictException);
    await simAws.backgroundTasksComplete();
  });

  it("lets the SDK's function-updated waiter finish", async () => {
    // Given an intercepted client and a function whose settings just changed.
    using simSdk = new SimSdk();
    const client = new LambdaClient({
      region: simSdk.simAws.defaultRegionName,
    });
    simSdk.intercept(client);
    await settledOrders(simSdk.simAws);
    await client.send(timeoutChange(5));

    // When the waiter real deploy code uses waits on the change.
    const waited = await waitUntilFunctionUpdatedV2(
      { client, minDelay: 1, maxWaitTime: 10 },
      { FunctionName: "orders" },
    );

    // Then it sees LastUpdateStatus reach Successful.
    assertIdentical(waited.state, "SUCCESS");
  });

  it("moves the RevisionId on with each change", async () => {
    const simAws = new SimAws();
    await settledOrders(simAws);
    const before = await simAws
      .lambda()
      .getFunctionConfiguration(
        new GetFunctionConfigurationCommand({ FunctionName: "orders" }),
      );

    const changed = await simAws
      .lambda()
      .updateFunctionConfiguration(timeoutChange(5));
    await simAws.backgroundTasksComplete();

    assertNotEqual(changed.RevisionId, before.RevisionId);
  });

  it("refuses a change naming a RevisionId the function has moved on from", async () => {
    // Given a revision read before a change was made.
    const simAws = new SimAws();
    await settledOrders(simAws);
    const { RevisionId } = await simAws
      .lambda()
      .getFunctionConfiguration(
        new GetFunctionConfigurationCommand({ FunctionName: "orders" }),
      );
    await simAws.lambda().updateFunctionConfiguration(timeoutChange(5));
    await simAws.backgroundTasksComplete();

    // When a code change and a publish name that stale revision.
    const updating = await assertThrowsErrorAsync(async () =>
      simAws.lambda().updateFunctionCode(
        new UpdateFunctionCodeCommand({
          FunctionName: "orders",
          ZipFile: makeLambdaZipFileInput(() => "second"),
          RevisionId,
        }),
      ),
    );
    const publishing = await assertThrowsErrorAsync(async () =>
      simAws
        .lambda()
        .publishVersion(
          new PublishVersionCommand({ FunctionName: "orders", RevisionId }),
        ),
    );

    // Then both are refused, as real Lambda refuses them.
    assertInstanceOf(updating, SimLambdaPreconditionFailedException);
    assertInstanceOf(publishing, SimLambdaPreconditionFailedException);
  });

  it("applies a change naming the function's current RevisionId", async () => {
    const simAws = new SimAws();
    await settledOrders(simAws);
    const { RevisionId } = await simAws
      .lambda()
      .getFunctionConfiguration(
        new GetFunctionConfigurationCommand({ FunctionName: "orders" }),
      );

    const changed = await simAws.lambda().updateFunctionConfiguration(
      new UpdateFunctionConfigurationCommand({
        FunctionName: "orders",
        Timeout: 9,
        RevisionId,
      }),
    );

    assertIdentical(changed.Timeout, 9);
    await simAws.backgroundTasksComplete();
  });

  it("changes nothing for a DryRun code update", async () => {
    // Given a settled function.
    const simAws = new SimAws();
    await settledOrders(simAws);

    // When its code is updated as a dry run.
    const dryRun = await simAws.lambda().updateFunctionCode(
      new UpdateFunctionCodeCommand({
        FunctionName: "orders",
        ZipFile: makeLambdaZipFileInput(() => "second"),
        DryRun: true,
      }),
    );
    const invoked = await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "orders" }));

    // Then no update began, and the function still runs its first code.
    assertIdentical(dryRun.LastUpdateStatus, "Successful");
    assertIdentical(
      Buffer.from(invoked.Payload ?? new Uint8Array()).toString(),
      '"first"',
    );
  });
});

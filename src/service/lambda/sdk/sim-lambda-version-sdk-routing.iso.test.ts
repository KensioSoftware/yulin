import {
  CreateAliasCommand,
  CreateFunctionCommand,
  DeleteAliasCommand,
  GetAliasCommand,
  InvokeCommand,
  LambdaClient,
  ListAliasesCommand,
  ListVersionsByFunctionCommand,
  PublishVersionCommand,
  UpdateAliasCommand,
} from "@aws-sdk/client-lambda";
import {
  assertArrayEmpty,
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimSdk } from "../../../sdk/index.js";
import { makeLambdaZipFileInput } from "../function/code/lambda-zip-file-input.js";

describe("simulated Lambda version and alias SDK Command routing", () => {
  it("round-trips the version and alias Commands through an intercepted client", async () => {
    // Given an intercepted Lambda client with a function
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

    // When versions are published and an alias is moved between them
    const first = await client.send(
      new PublishVersionCommand({ FunctionName: "intercepted" }),
    );
    const second = await client.send(
      new PublishVersionCommand({ FunctionName: "intercepted" }),
    );
    await client.send(
      new CreateAliasCommand({
        FunctionName: "intercepted",
        Name: "live",
        FunctionVersion: first.Version,
      }),
    );
    await client.send(
      new UpdateAliasCommand({
        FunctionName: "intercepted",
        Name: "live",
        FunctionVersion: second.Version,
      }),
    );

    // Then each Command reaches the simulation, and the alias invokes the
    // version it was moved to
    const alias = await client.send(
      new GetAliasCommand({ FunctionName: "intercepted", Name: "live" }),
    );
    assertIdentical(alias.FunctionVersion, "2");

    const versions = await client.send(
      new ListVersionsByFunctionCommand({ FunctionName: "intercepted" }),
    );
    assertArrayEquals(
      (versions.Versions ?? []).map((version) => version.Version),
      ["$LATEST", "1", "2"],
    );

    const invoked = await client.send(
      new InvokeCommand({ FunctionName: "intercepted", Qualifier: "live" }),
    );
    assertIdentical(invoked.ExecutedVersion, "2");

    const listed = await client.send(
      new ListAliasesCommand({ FunctionName: "intercepted" }),
    );
    assertArrayLength(listed.Aliases ?? [], 1);

    await client.send(
      new DeleteAliasCommand({ FunctionName: "intercepted", Name: "live" }),
    );
    const remaining = await client.send(
      new ListAliasesCommand({ FunctionName: "intercepted" }),
    );
    assertArrayEmpty(remaining.Aliases ?? []);
  });
});

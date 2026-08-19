import {
  CreateAliasCommand,
  CreateFunctionCommand,
  DeleteAliasCommand,
  GetAliasCommand,
  ListAliasesCommand,
  PublishVersionCommand,
  UpdateAliasCommand,
} from "@aws-sdk/client-lambda";
import {
  assertArrayEquals,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { SimLambdaResourceNotFoundException } from "../../error/sim-lambda.error.js";
import { makeLambdaZipFileInput } from "../../function/code/lambda-zip-file-input.js";
import type { SimLambda } from "../../sim-lambda.js";

/**
 * A function with two published versions, which is the state every alias
 * command here acts on.
 */
async function givenFunctionWithTwoVersions(): Promise<SimLambda> {
  const lambda = new SimAws().lambda();

  await lambda.createFunction(
    new CreateFunctionCommand({
      FunctionName: "orders",
      Role: "arn:aws:iam::111111111111:role/OrdersRole",
      Code: { ZipFile: makeLambdaZipFileInput(() => "handled") },
    }),
  );
  await lambda.publishVersion(
    new PublishVersionCommand({ FunctionName: "orders" }),
  );
  await lambda.publishVersion(
    new PublishVersionCommand({ FunctionName: "orders" }),
  );

  return lambda;
}

describe("Lambda alias commands", () => {
  it("points a new alias at a published version", async () => {
    const lambda = await givenFunctionWithTwoVersions();

    // When an alias is created for version 1.
    const alias = await lambda.createAlias(
      new CreateAliasCommand({
        FunctionName: "orders",
        Name: "live",
        FunctionVersion: "1",
        Description: "What the shop calls",
      }),
    );

    // Then it is addressed by the function ARN with its own name on the end.
    assertIdentical(alias.Name, "live");
    assertIdentical(alias.FunctionVersion, "1");
    assertIdentical(alias.Description, "What the shop calls");
    assertStringIncludes(alias.AliasArn, ":function:orders:live");
  });

  it("points an existing alias at another version", async () => {
    const lambda = await givenFunctionWithTwoVersions();

    // Given an alias on version 1.
    await lambda.createAlias(
      new CreateAliasCommand({
        FunctionName: "orders",
        Name: "live",
        FunctionVersion: "1",
        Description: "What the shop calls",
      }),
    );

    // When it is moved to version 2 without describing it again.
    const updated = await lambda.updateAlias(
      new UpdateAliasCommand({
        FunctionName: "orders",
        Name: "live",
        FunctionVersion: "2",
      }),
    );

    // Then it points at the new version, and the description it had is left
    // as it was.
    assertIdentical(updated.FunctionVersion, "2");
    assertIdentical(updated.Description, "What the shop calls");
  });

  it("describes an alias again without moving it", async () => {
    const lambda = await givenFunctionWithTwoVersions();

    // Given an alias on version 2.
    await lambda.createAlias(
      new CreateAliasCommand({
        FunctionName: "orders",
        Name: "live",
        FunctionVersion: "2",
        Description: "What the shop calls",
      }),
    );

    // When only its description is updated.
    const updated = await lambda.updateAlias(
      new UpdateAliasCommand({
        FunctionName: "orders",
        Name: "live",
        Description: "What the shop calls now",
      }),
    );

    // Then it still points where it did, under the new description.
    assertIdentical(updated.FunctionVersion, "2");
    assertIdentical(updated.Description, "What the shop calls now");
  });

  it("refuses moving an alias to a version that does not exist", async () => {
    const lambda = await givenFunctionWithTwoVersions();

    // Given an alias on version 1.
    await lambda.createAlias(
      new CreateAliasCommand({
        FunctionName: "orders",
        Name: "live",
        FunctionVersion: "1",
      }),
    );

    // When it is moved to a version nothing published.
    const error = await assertThrowsErrorAsync(async () =>
      lambda.updateAlias(
        new UpdateAliasCommand({
          FunctionName: "orders",
          Name: "live",
          FunctionVersion: "9",
        }),
      ),
    );

    // Then the version that is missing is what gets reported, and the alias
    // stays where it was.
    assertInstanceOf(error, SimLambdaResourceNotFoundException);
    const alias = await lambda.getAlias(
      new GetAliasCommand({ FunctionName: "orders", Name: "live" }),
    );
    assertIdentical(alias.FunctionVersion, "1");
  });

  it("throws when updating an alias that does not exist", async () => {
    const lambda = await givenFunctionWithTwoVersions();

    // When an alias nothing created is updated.
    const error = await assertThrowsErrorAsync(async () =>
      lambda.updateAlias(
        new UpdateAliasCommand({
          FunctionName: "orders",
          Name: "missing",
          FunctionVersion: "1",
        }),
      ),
    );

    // Then the missing alias is what gets reported.
    assertInstanceOf(error, SimLambdaResourceNotFoundException);
    assertStringIncludes(error.message, "Alias not found");
  });

  it("lists a function's aliases, and the ones on one version", async () => {
    const lambda = await givenFunctionWithTwoVersions();

    // Given two aliases on different versions.
    await lambda.createAlias(
      new CreateAliasCommand({
        FunctionName: "orders",
        Name: "live",
        FunctionVersion: "1",
      }),
    );
    await lambda.createAlias(
      new CreateAliasCommand({
        FunctionName: "orders",
        Name: "next",
        FunctionVersion: "2",
      }),
    );

    // When they are listed, with and without a version to narrow to.
    const all = await lambda.listAliases(
      new ListAliasesCommand({ FunctionName: "orders" }),
    );
    const onVersionTwo = await lambda.listAliases(
      new ListAliasesCommand({ FunctionName: "orders", FunctionVersion: "2" }),
    );

    // Then both come back in the order they were created, and the narrowed
    // listing has only the alias pointing at that version.
    assertArrayEquals(
      all.Aliases.map((alias) => alias.Name),
      ["live", "next"],
    );
    assertArrayEquals(
      onVersionTwo.Aliases.map((alias) => alias.Name),
      ["next"],
    );
  });

  it("drops an alias, leaving the version it pointed at", async () => {
    const lambda = await givenFunctionWithTwoVersions();

    // Given an alias on version 1.
    await lambda.createAlias(
      new CreateAliasCommand({
        FunctionName: "orders",
        Name: "live",
        FunctionVersion: "1",
      }),
    );

    // When it is deleted.
    await lambda.deleteAlias(
      new DeleteAliasCommand({ FunctionName: "orders", Name: "live" }),
    );

    // Then the alias is gone and the version is still there.
    const error = await assertThrowsErrorAsync(async () =>
      lambda.getAlias(
        new GetAliasCommand({ FunctionName: "orders", Name: "live" }),
      ),
    );
    assertInstanceOf(error, SimLambdaResourceNotFoundException);
    const listed = await lambda.listAliases(
      new ListAliasesCommand({ FunctionName: "orders" }),
    );
    assertArrayEquals(
      listed.Aliases.map((alias) => alias.Name),
      [],
    );
  });

  it("throws when deleting an alias that does not exist", async () => {
    const lambda = await givenFunctionWithTwoVersions();

    // When an alias nothing created is deleted.
    const error = await assertThrowsErrorAsync(async () =>
      lambda.deleteAlias(
        new DeleteAliasCommand({ FunctionName: "orders", Name: "missing" }),
      ),
    );

    // Then the missing alias is what gets reported.
    assertInstanceOf(error, SimLambdaResourceNotFoundException);
    assertStringIncludes(error.message, "Alias not found");
  });

  it("throws on an undefined alias name", async () => {
    const lambda = await givenFunctionWithTwoVersions();

    // When an alias is read without naming one.
    const error = await assertThrowsErrorAsync(async () =>
      lambda.getAlias(
        new GetAliasCommand({ FunctionName: "orders", Name: undefined }),
      ),
    );

    // Then the missing input is reported.
    assertStringIncludes(error.message, "GetAliasCommand.input.Name required");
  });

  it("denies an explicitly anonymous caller through sim IAM", async () => {
    const lambda = await givenFunctionWithTwoVersions();

    // When an anonymous caller creates an alias.
    const error = await assertThrowsErrorAsync(async () =>
      lambda.createAlias(
        new CreateAliasCommand({
          FunctionName: "orders",
          Name: "live",
          FunctionVersion: "1",
        }),
        { caller: { kind: "anonymous" } },
      ),
    );

    // Then the request is denied for the matching IAM action.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "lambda:CreateAlias");
  });
});

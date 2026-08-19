import {
  CreateAliasCommand,
  CreateFunctionCommand,
  ListAliasesCommand,
  PublishVersionCommand,
} from "@aws-sdk/client-lambda";
import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimLambdaInvalidParameterValueException,
  SimLambdaResourceConflictException,
  SimLambdaResourceNotFoundException,
  SimLambdaValidationException,
} from "../../error/sim-lambda.error.js";
import { makeLambdaZipFileInput } from "../../function/code/lambda-zip-file-input.js";
import type { SimLambda } from "../../sim-lambda.js";

/**
 * A function with two published versions, which is the state every refusal
 * here is measured against.
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

describe("Lambda alias command refusals", () => {
  it("refuses an alias for a version that does not exist", async () => {
    const lambda = await givenFunctionWithTwoVersions();

    // When an alias is created for a version nothing published.
    const error = await assertThrowsErrorAsync(async () =>
      lambda.createAlias(
        new CreateAliasCommand({
          FunctionName: "orders",
          Name: "live",
          FunctionVersion: "7",
        }),
      ),
    );

    // Then the version that is missing is what gets reported.
    assertInstanceOf(error, SimLambdaResourceNotFoundException);
    assertStringIncludes(error.message, ":function:orders:7");
  });

  it("refuses an alias for $LATEST", async () => {
    const lambda = await givenFunctionWithTwoVersions();

    // When an alias is pointed at the function itself.
    const error = await assertThrowsErrorAsync(async () =>
      lambda.createAlias(
        new CreateAliasCommand({
          FunctionName: "orders",
          Name: "live",
          FunctionVersion: "$LATEST",
        }),
      ),
    );

    // Then it fails the version pattern, as it does on real Lambda.
    assertInstanceOf(error, SimLambdaValidationException);
    assertStringIncludes(error.message, "'functionVersion'");
  });

  it("refuses an alias name that is already taken", async () => {
    const lambda = await givenFunctionWithTwoVersions();

    // Given an alias that exists.
    await lambda.createAlias(
      new CreateAliasCommand({
        FunctionName: "orders",
        Name: "live",
        FunctionVersion: "1",
      }),
    );

    // When another alias is created under the same name.
    const error = await assertThrowsErrorAsync(async () =>
      lambda.createAlias(
        new CreateAliasCommand({
          FunctionName: "orders",
          Name: "live",
          FunctionVersion: "2",
        }),
      ),
    );

    // Then the conflict is reported.
    assertInstanceOf(error, SimLambdaResourceConflictException);
    assertStringIncludes(error.message, "Alias already exists");
  });

  it("refuses a function name carrying a qualifier", async () => {
    const lambda = await givenFunctionWithTwoVersions();

    // When an alias is created against a name naming a version.
    const error = await assertThrowsErrorAsync(async () =>
      lambda.createAlias(
        new CreateAliasCommand({
          FunctionName: "orders:1",
          Name: "live",
          FunctionVersion: "1",
        }),
      ),
    );

    // Then it is refused rather than acting on the function anyway.
    assertInstanceOf(error, SimLambdaInvalidParameterValueException);
    assertStringIncludes(error.message, "qualified function");
  });

  it("checks the version it was given before looking the function up", async () => {
    const lambda = await givenFunctionWithTwoVersions();

    // When an alias is created on a missing function with an unusable version.
    const error = await assertThrowsErrorAsync(async () =>
      lambda.createAlias(
        new CreateAliasCommand({
          FunctionName: "missing",
          Name: "live",
          FunctionVersion: "$LATEST",
        }),
      ),
    );

    // Then the input is what gets reported, as AWS reports it ahead of
    // anything about the resource.
    assertInstanceOf(error, SimLambdaValidationException);
    assertStringIncludes(error.message, "'functionVersion'");
  });

  it("throws when listing the aliases of a version that does not exist", async () => {
    const lambda = await givenFunctionWithTwoVersions();

    // When the listing is narrowed to a version nothing published.
    const error = await assertThrowsErrorAsync(async () =>
      lambda.listAliases(
        new ListAliasesCommand({
          FunctionName: "orders",
          FunctionVersion: "8",
        }),
      ),
    );

    // Then the version that is missing is what gets reported, rather than an
    // empty listing.
    assertInstanceOf(error, SimLambdaResourceNotFoundException);
    assertStringIncludes(error.message, ":function:orders:8");
  });
});

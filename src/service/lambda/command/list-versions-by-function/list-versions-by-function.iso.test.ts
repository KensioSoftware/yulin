import {
  CreateFunctionCommand,
  ListVersionsByFunctionCommand,
  PublishVersionCommand,
} from "@aws-sdk/client-lambda";
import {
  assertArrayEquals,
  assertArrayLength,
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
import { SimLambda } from "../../sim-lambda.js";

describe("Lambda ListVersionsByFunctionCommand", () => {
  it("lists $LATEST and each published version", async () => {
    // Given a function with two published versions.
    const simAws = new SimAws();
    const lambda = simAws.lambda();
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

    // When the function's versions are listed.
    const listed = await lambda.listVersionsByFunction(
      new ListVersionsByFunctionCommand({ FunctionName: "orders" }),
    );

    // Then $LATEST comes first, followed by each version in the order they
    // were published.
    assertArrayLength(listed.Versions, 3);
    assertArrayEquals(
      listed.Versions.map((version) => version.Version),
      ["$LATEST", "1", "2"],
    );
    assertStringIncludes(listed.Versions[2].FunctionArn, ":orders:2");
  });

  it("lists only $LATEST for a function that has published nothing", async () => {
    // Given a function with no published versions.
    const simLambda = new SimLambda();
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "orders",
        Role: "arn:aws:iam::111111111111:role/OrdersRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => "handled") },
      }),
    );

    // When its versions are listed.
    const listed = await simLambda.listVersionsByFunction(
      new ListVersionsByFunctionCommand({ FunctionName: "orders" }),
    );

    // Then the function itself is the only version there is.
    assertArrayLength(listed.Versions, 1);
    assertIdentical(listed.Versions[0].Version, "$LATEST");
  });

  it("throws on a function that does not exist", async () => {
    // Given a simulated AWS with no functions.
    const simAws = new SimAws();

    // When the versions of a missing function are listed.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .lambda()
        .listVersionsByFunction(
          new ListVersionsByFunctionCommand({ FunctionName: "missing" }),
        ),
    );

    // Then the missing function is what gets reported.
    assertInstanceOf(error, SimLambdaResourceNotFoundException);
    assertStringIncludes(error.message, "Function not found");
  });

  it("throws on an undefined function name", async () => {
    // Given a standalone sim Lambda.
    const simLambda = new SimLambda();

    // When versions are listed without naming a function.
    const error = await assertThrowsErrorAsync(async () =>
      simLambda.listVersionsByFunction(
        new ListVersionsByFunctionCommand({ FunctionName: undefined }),
      ),
    );

    // Then the missing input is reported.
    assertStringIncludes(
      error.message,
      "ListVersionsByFunctionCommand.input.FunctionName required",
    );
  });

  it("denies an explicitly anonymous caller through sim IAM", async () => {
    // Given a simulated AWS with sim IAM in play.
    const simAws = new SimAws();

    // When an anonymous caller lists a function's versions.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .lambda()
        .listVersionsByFunction(
          new ListVersionsByFunctionCommand({ FunctionName: "orders" }),
          { caller: { kind: "anonymous" } },
        ),
    );

    // Then the request is denied for the matching IAM action.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "lambda:ListVersionsByFunction");
  });
});

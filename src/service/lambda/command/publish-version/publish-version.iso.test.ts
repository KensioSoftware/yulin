import {
  CreateFunctionCommand,
  GetFunctionCommand,
  PublishVersionCommand,
} from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertInstanceOf,
  assertStringEndsWith,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import {
  SimLambdaInvalidParameterValueException,
  SimLambdaResourceNotFoundException,
} from "../../error/sim-lambda.error.js";
import { makeLambdaZipFileInput } from "../../function/code/lambda-zip-file-input.js";
import { SimLambda } from "../../sim-lambda.js";

describe("Lambda PublishVersionCommand", () => {
  it("publishes a function's first version as 1", async () => {
    // Given a function with no published versions.
    const simLambda = new SimLambda();
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

    // When a version is published.
    const published = await simLambda.publishVersion(
      new PublishVersionCommand({ FunctionName: "orders" }),
    );

    // Then it is version 1, addressed by a qualified ARN, and carries the
    // configuration it was published with.
    assertIdentical(published.Version, "1");
    assertStringIncludes(published.FunctionArn, ":function:orders:1");
    assertIdentical(published.State, "Active");
    assertIdentical(published.MemorySize, 512);
    assertIdentical(published.Timeout, 30);
    assertIdentical(published.Environment?.Variables["STAGE"], "live");
  });

  it("numbers each later version upwards", async () => {
    // Given a function that has published a version already.
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

    // When another is published.
    const published = await lambda.publishVersion(
      new PublishVersionCommand({ FunctionName: "orders" }),
    );

    // Then it is the next number up.
    assertIdentical(published.Version, "2");
  });

  it("leaves the function itself reporting $LATEST", async () => {
    // Given a function with a published version.
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

    // When the function is read without a qualifier.
    const fetched = await lambda.getFunction(
      new GetFunctionCommand({ FunctionName: "orders" }),
    );

    // Then the version it reports is still $LATEST, under the unqualified ARN.
    assertIdentical(fetched.Configuration.Version, "$LATEST");
    assertStringEndsWith(fetched.Configuration.FunctionArn, ":function:orders");
  });

  it("throws on a function that does not exist", async () => {
    // Given a simulated AWS with no functions.
    const simAws = new SimAws();

    // When a version is published for a missing function.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .lambda()
        .publishVersion(new PublishVersionCommand({ FunctionName: "missing" })),
    );

    // Then the missing function is what gets reported.
    assertInstanceOf(error, SimLambdaResourceNotFoundException);
    assertStringIncludes(error.message, "Function not found");
  });

  it("refuses a function name carrying a qualifier", async () => {
    // Given a function with a published version.
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

    // When a version is published from a name naming one of its versions.
    const error = await assertThrowsErrorAsync(async () =>
      lambda.publishVersion(
        new PublishVersionCommand({ FunctionName: "orders:1" }),
      ),
    );

    // Then it is refused rather than published from the function anyway.
    assertInstanceOf(error, SimLambdaInvalidParameterValueException);
    assertStringIncludes(error.message, "qualified function");
  });

  it("throws on an undefined function name", async () => {
    // Given a standalone sim Lambda.
    const simLambda = new SimLambda();

    // When a version is published without naming a function.
    const error = await assertThrowsErrorAsync(async () =>
      simLambda.publishVersion(
        new PublishVersionCommand({ FunctionName: undefined }),
      ),
    );

    // Then the missing input is reported.
    assertStringIncludes(
      error.message,
      "PublishVersionCommand.input.FunctionName required",
    );
  });

  it("denies an explicitly anonymous caller through sim IAM", async () => {
    // Given a simulated AWS with sim IAM in play.
    const simAws = new SimAws();

    // When an anonymous caller publishes a version.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .lambda()
        .publishVersion(new PublishVersionCommand({ FunctionName: "orders" }), {
          caller: { kind: "anonymous" },
        }),
    );

    // Then the request is denied for the matching IAM action.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "lambda:PublishVersion");
  });
});

import {
  CreateAliasCommand,
  CreateFunctionCommand,
  GetFunctionCommand,
  InvokeCommand,
  PublishVersionCommand,
} from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimLambdaInvalidParameterValueException,
  SimLambdaResourceNotFoundException,
} from "../../error/sim-lambda.error.js";
import { makeLambdaZipFileInput } from "../../function/code/lambda-zip-file-input.js";
import type { SimLambda } from "../../sim-lambda.js";

/**
 * A function whose handler reports the version and ARN it was invoked as, with
 * one published version behind an alias.
 */
async function givenPublishedFunction(): Promise<SimLambda> {
  const lambda = new SimAws().lambda();

  await lambda.createFunction(
    new CreateFunctionCommand({
      FunctionName: "orders",
      Role: "arn:aws:iam::111111111111:role/OrdersRole",
      Code: {
        ZipFile: makeLambdaZipFileInput((_event, context) => ({
          functionVersion: context.functionVersion,
          invokedFunctionArn: context.invokedFunctionArn,
        })),
      },
    }),
  );
  await lambda.publishVersion(
    new PublishVersionCommand({ FunctionName: "orders" }),
  );
  await lambda.createAlias(
    new CreateAliasCommand({
      FunctionName: "orders",
      Name: "live",
      FunctionVersion: "1",
    }),
  );

  return lambda;
}

function invokedPayload(payload: Uint8Array | undefined): {
  functionVersion: string;
  invokedFunctionArn: string;
} {
  assertNonNullable(payload);

  return JSON.parse(Buffer.from(payload).toString()) as {
    functionVersion: string;
    invokedFunctionArn: string;
  };
}

describe("Lambda Invoke with a qualifier", () => {
  it("runs the version a Qualifier names", async () => {
    const lambda = await givenPublishedFunction();

    // When the function is invoked for version 1.
    const invoked = await lambda.invoke(
      new InvokeCommand({ FunctionName: "orders", Qualifier: "1" }),
    );

    // Then that version ran, and is what the answer reports.
    assertIdentical(invoked.ExecutedVersion, "1");
    const payload = invokedPayload(invoked.Payload);
    assertIdentical(payload.functionVersion, "1");
    assertStringIncludes(payload.invokedFunctionArn, ":function:orders:1");
  });

  it("runs the version an alias points at", async () => {
    const lambda = await givenPublishedFunction();

    // When the function is invoked through its alias.
    const invoked = await lambda.invoke(
      new InvokeCommand({ FunctionName: "orders", Qualifier: "live" }),
    );

    // Then the version behind the alias ran, reported by its number.
    assertIdentical(invoked.ExecutedVersion, "1");
    assertIdentical(invokedPayload(invoked.Payload).functionVersion, "1");
  });

  it("reads the qualifier off a qualified function ARN", async () => {
    const lambda = await givenPublishedFunction();
    const { Configuration } = await lambda.getFunction(
      new GetFunctionCommand({ FunctionName: "orders" }),
    );

    // When the function is invoked by an ARN naming the alias.
    const invoked = await lambda.invoke(
      new InvokeCommand({
        FunctionName: `${Configuration.FunctionArn}:live`,
      }),
    );

    // Then it resolves the same way a Qualifier does.
    assertIdentical(invoked.ExecutedVersion, "1");
  });

  it("runs the function itself for $LATEST and for no qualifier", async () => {
    const lambda = await givenPublishedFunction();

    // When the function is invoked with $LATEST, and with nothing.
    const latest = await lambda.invoke(
      new InvokeCommand({ FunctionName: "orders", Qualifier: "$LATEST" }),
    );
    const unqualified = await lambda.invoke(
      new InvokeCommand({ FunctionName: "orders" }),
    );

    // Then both run the function rather than any published version.
    assertIdentical(latest.ExecutedVersion, "$LATEST");
    assertIdentical(unqualified.ExecutedVersion, "$LATEST");
    assertStringIncludes(
      invokedPayload(unqualified.Payload).invokedFunctionArn,
      ":function:orders",
    );
  });

  it("throws on a qualifier naming no version or alias", async () => {
    const lambda = await givenPublishedFunction();

    // When the function is invoked for something nothing published.
    const error = await assertThrowsErrorAsync(async () =>
      lambda.invoke(
        new InvokeCommand({ FunctionName: "orders", Qualifier: "PROD" }),
      ),
    );

    // Then the qualified function is what gets reported as missing.
    assertInstanceOf(error, SimLambdaResourceNotFoundException);
    assertStringIncludes(error.message, ":function:orders:PROD");
  });

  it("throws when the name and the Qualifier disagree", async () => {
    const lambda = await givenPublishedFunction();

    // When a request qualifies the name one way and asks for another.
    const error = await assertThrowsErrorAsync(async () =>
      lambda.invoke(
        new InvokeCommand({ FunctionName: "orders:live", Qualifier: "1" }),
      ),
    );

    // Then it is refused rather than one of the two being picked.
    assertInstanceOf(error, SimLambdaInvalidParameterValueException);
    assertStringIncludes(error.message, "does not match");
  });

  it("reports the version that failed when a handler throws", async () => {
    // Given a published version whose handler throws.
    const lambda = new SimAws().lambda();
    await lambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "orders",
        Role: "arn:aws:iam::111111111111:role/OrdersRole",
        Code: {
          ZipFile: makeLambdaZipFileInput(() => {
            throw new Error("no");
          }),
        },
      }),
    );
    await lambda.publishVersion(
      new PublishVersionCommand({ FunctionName: "orders" }),
    );

    // When that version is invoked.
    const invoked = await lambda.invoke(
      new InvokeCommand({ FunctionName: "orders", Qualifier: "1" }),
    );

    // Then the failure is reported against the version that ran.
    assertIdentical(invoked.FunctionError, "Unhandled");
    assertIdentical(invoked.ExecutedVersion, "1");
  });
});

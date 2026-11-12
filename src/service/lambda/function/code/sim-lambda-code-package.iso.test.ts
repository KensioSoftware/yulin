import { createHash } from "node:crypto";

import {
  CreateFunctionCommand,
  GetFunctionCommand,
  PublishVersionCommand,
  UpdateFunctionCodeCommand,
} from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertInstanceOf,
  assertNotEqual,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimLambdaInvalidParameterValueException } from "../../error/sim-lambda.error.js";
import { makeLambdaCodeZip } from "./make-lambda-code-zip.js";

const zipBytes = makeLambdaCodeZip("exports.handler = async () => 'v1';");

async function simAwsWithZipFunction(): Promise<SimAws> {
  const simAws = new SimAws();
  await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: "orders",
      Role: `arn:aws:iam::${simAws.defaultAccountId}:role/OrdersRole`,
      Handler: "index.handler",
      Runtime: "nodejs22.x",
      Code: { ZipFile: zipBytes },
    }),
  );
  await simAws.backgroundTasksComplete();

  return simAws;
}

describe("Lambda function code packages", () => {
  it("reports the digest and size of the zip a function was created from", async () => {
    // Given a function created from zip bytes.
    const simAws = await simAwsWithZipFunction();

    // When it is read.
    const { Configuration } = await simAws
      .lambda()
      .getFunction(new GetFunctionCommand({ FunctionName: "orders" }));

    // Then it reports the base64 SHA-256 and the byte length of that zip.
    assertIdentical(
      Configuration.CodeSha256,
      createHash("sha256").update(zipBytes).digest("base64"),
    );
    assertIdentical(Configuration.CodeSize, zipBytes.byteLength);
  });

  it("reports a new digest once the code is replaced", async () => {
    const simAws = await simAwsWithZipFunction();

    const updated = await simAws.lambda().updateFunctionCode(
      new UpdateFunctionCodeCommand({
        FunctionName: "orders",
        ZipFile: makeLambdaCodeZip("exports.handler = async () => 'v2';"),
      }),
    );

    assertNotEqual(
      updated.CodeSha256,
      createHash("sha256").update(zipBytes).digest("base64"),
    );
  });

  it("publishes a version only while the code has the digest the request names", async () => {
    // Given a function and the digest of its code.
    const simAws = await simAwsWithZipFunction();
    const { Configuration } = await simAws
      .lambda()
      .getFunction(new GetFunctionCommand({ FunctionName: "orders" }));

    // When a version is published naming a stale digest, and then the
    // current one.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.lambda().publishVersion(
        new PublishVersionCommand({
          FunctionName: "orders",
          CodeSha256: "c3RhbGU=",
        }),
      ),
    );
    const published = await simAws.lambda().publishVersion(
      new PublishVersionCommand({
        FunctionName: "orders",
        CodeSha256: Configuration.CodeSha256,
      }),
    );

    // Then the stale digest is refused and the current one publishes.
    assertInstanceOf(error, SimLambdaInvalidParameterValueException);
    assertIdentical(published.Version, "1");
    assertIdentical(published.CodeSha256, Configuration.CodeSha256);
  });
});

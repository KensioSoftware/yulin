/**
 * Simulated Lambda reaches this scope's simulated S3 while it is being built,
 * for function code held in a Bucket. If simulated S3 reached back for Lambda
 * the same way, building either one first would recurse: the memo behind the
 * per-scope service accessors records a service only once its factory has
 * returned, and has no re-entrancy guard.
 *
 * The bug only shows up under one construction order, so both are exercised
 * here.
 */

import { CreateFunctionCommand } from "@aws-sdk/client-lambda";
import { CreateBucketCommand } from "@aws-sdk/client-s3";
import { assertIdentical, assertNonNullable } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../lambda/function/code/lambda-zip-file-input.js";

describe("Constructing simulated S3 and Lambda in either order", () => {
  it("builds S3 first", async () => {
    // Given a simulated AWS whose S3 is asked for first
    const simAws = new SimAws();

    // When a Bucket and then a function are created
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "thumbnailer",
        Role: "arn:aws:iam::888888888888:role/ThumbnailerRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => "thumbnailed") },
      }),
    );

    // Then both services are there
    assertNonNullable(
      simAws.s3().getSimBucketByName("uploads"),
      "the Bucket was created",
    );
    assertIdentical(
      simAws.lambda().getSimFunctionByName("thumbnailer")?.name,
      "thumbnailer",
    );
  });

  it("builds Lambda first", async () => {
    // Given a simulated AWS whose Lambda is asked for first
    const simAws = new SimAws();

    // When a function and then a Bucket are created
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "thumbnailer",
        Role: "arn:aws:iam::888888888888:role/ThumbnailerRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => "thumbnailed") },
      }),
    );
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));

    // Then both services are there
    assertNonNullable(
      simAws.s3().getSimBucketByName("uploads"),
      "the Bucket was created",
    );
    assertIdentical(
      simAws.lambda().getSimFunctionByName("thumbnailer")?.name,
      "thumbnailer",
    );
  });
});

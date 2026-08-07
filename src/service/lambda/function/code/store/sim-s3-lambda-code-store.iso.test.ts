import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import {
  type SimLambdaCodeObjectSource,
  SimS3LambdaCodeStore,
} from "./sim-s3-lambda-code-store.js";

describe("sim S3 Lambda code store", () => {
  it("wraps a non-Error S3 failure in an Error", async () => {
    // Given an object source failing with a non-Error value.
    const s3: SimLambdaCodeObjectSource = {
      // oxlint-disable-next-line typescript/prefer-promise-reject-errors
      getObject: () => Promise.reject("catastrophic string failure"),
    };
    const store = new SimS3LambdaCodeStore({ s3 });

    // When the code zip fetch fails.
    const error = await assertThrowsErrorAsync(async () =>
      store.getZipBytes({ bucketName: "bucket", objectKey: "code.zip" }),
    );

    // Then the failure still surfaces as an Error.
    assertInstanceOf(error, Error);
    assertIdentical(error.message, "catastrophic string failure");
  });

  it("requires the fetched S3 object to have a body", async () => {
    // Given an object source returning an object with no body stream.
    const s3: SimLambdaCodeObjectSource = {
      getObject: () => Promise.resolve({}),
    };
    const store = new SimS3LambdaCodeStore({ s3 });

    // When the code zip fetch completes without a body.
    const error = await assertThrowsErrorAsync(async () =>
      store.getZipBytes({ bucketName: "bucket", objectKey: "code.zip" }),
    );

    // Then the missing body is reported with the object location.
    assertStringIncludes(error.message, "s3://bucket/code.zip has no body");
  });
});

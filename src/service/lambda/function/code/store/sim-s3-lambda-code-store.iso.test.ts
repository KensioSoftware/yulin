import type { Readable } from "node:stream";
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

function makeStore(getObject: () => Promise<{ Body?: Readable }>): {
  store: SimS3LambdaCodeStore;
} {
  const s3: SimLambdaCodeObjectSource = {
    getObject: async () => await getObject(),
  };
  return { store: new SimS3LambdaCodeStore({ s3 }) };
}

describe("sim S3 Lambda code store", () => {
  it("wraps a non-Error S3 failure in an Error", async () => {
    // Given an object source failing with a non-Error value.
    const { store } = makeStore(() =>
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      Promise.reject("catastrophic string failure"),
    );

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
    const { store } = makeStore(() => Promise.resolve({}));

    // When the code zip fetch completes without a body.
    const error = await assertThrowsErrorAsync(async () =>
      store.getZipBytes({ bucketName: "bucket", objectKey: "code.zip" }),
    );

    // Then the missing body is reported with the object location.
    assertStringIncludes(error.message, "s3://bucket/code.zip has no body");
  });
});

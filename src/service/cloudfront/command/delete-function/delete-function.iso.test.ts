import {
  CreateFunctionCommand,
  DeleteFunctionCommand,
} from "@aws-sdk/client-cloudfront";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { SimCloudFrontNoSuchFunctionExists } from "../../error/sim-cloudfront.error.js";
import type { SimCloudFront } from "../../sim-cloudfront.js";

const functionCode = Buffer.from(`
  function handler(event) {
    return event.request;
  }
`);

async function givenFunction(name: string): Promise<{
  readonly simAws: SimAws;
  readonly simCloudFront: SimCloudFront;
}> {
  const simAws = new SimAws();
  const simCloudFront = simAws.cloudFront();

  await simCloudFront.createFunction(
    new CreateFunctionCommand({
      Name: name,
      FunctionConfig: { Comment: name, Runtime: "cloudfront-js-2.0" },
      FunctionCode: functionCode,
    }),
  );
  await simAws.backgroundTasksComplete();

  return { simAws, simCloudFront };
}

describe("CloudFront DeleteFunctionCommand", () => {
  it("deletes a CloudFront Function", async () => {
    // Given a published CloudFront Function.
    const { simCloudFront } = await givenFunction("deletable-cff");
    assertNonNullable(
      simCloudFront.getCloudFrontFunctionByName("deletable-cff"),
    );

    // When the Function is deleted.
    const output = await simCloudFront.deleteFunction(
      new DeleteFunctionCommand({
        Name: "deletable-cff",
        IfMatch: "E2QWRUHAPOMQZL",
      }),
    );

    // Then CloudFront accepts it, and the Function is gone.
    assertIdentical(output.$metadata.httpStatusCode, 204);
    assertUndefined(simCloudFront.getCloudFrontFunctionByName("deletable-cff"));
  });

  it("rejects a Function that does not exist", async () => {
    // Given a simulated CloudFront without the requested Function.
    const simCloudFront = new SimAws().cloudFront();

    // When the missing Function is deleted.
    const error = await assertThrowsErrorAsync(async () =>
      simCloudFront.deleteFunction(
        new DeleteFunctionCommand({
          Name: "no-such-cff",
          IfMatch: "E2QWRUHAPOMQZL",
        }),
      ),
    );

    // Then CloudFront answers with its missing-Function error.
    assertInstanceOf(error, SimCloudFrontNoSuchFunctionExists);
    assertIdentical(error.$metadata.httpStatusCode, 404);
  });

  it("requires a Function name", async () => {
    // Given a simulated CloudFront.
    const simCloudFront = new SimAws().cloudFront();

    // When a deletion arrives without a name.
    const error = await assertThrowsErrorAsync(async () =>
      simCloudFront.deleteFunction(
        new DeleteFunctionCommand({
          Name: undefined,
          IfMatch: "E2QWRUHAPOMQZL",
        }),
      ),
    );

    // Then it is refused before anything is deleted.
    assertInstanceOf(error, Error);
  });

  it("denies a caller without DeleteFunction permission", async () => {
    // Given a CloudFront Function in a simulation with IAM.
    const { simCloudFront } = await givenFunction("protected-cff");

    // When an anonymous caller deletes it.
    const error = await assertThrowsErrorAsync(async () =>
      simCloudFront.deleteFunction(
        new DeleteFunctionCommand({
          Name: "protected-cff",
          IfMatch: "E2QWRUHAPOMQZL",
        }),
        { caller: { kind: "anonymous" } },
      ),
    );

    // Then IAM denies the removal action, and the Function stays.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "cloudfront:DeleteFunction");
    assertNonNullable(
      simCloudFront.getCloudFrontFunctionByName("protected-cff"),
    );
  });
});

import { CreateFunctionCommand } from "@aws-sdk/client-cloudfront";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { CloudFrontFunction } from "../../typings/cloudfront-functions.namespace.js";
import { makeCffFunctionCodeInput } from "../../cff/function-code-input/cff-function-code-input.js";
import { SimCloudFrontFunctionSizeLimitExceeded } from "../../error/sim-cloudfront.error.js";
import { maxCffCodeBytes } from "./create-function-code-size.js";

const handlerSource = "function handler(event) { return event.request; }\n// ";

const passThroughHandler: CloudFrontFunction.ViewerRequestHandler = (
  event: CloudFrontFunction.ViewerRequestEvent,
) => event.request;

/**
 * Runnable Function source padded out to an exact byte length.
 *
 * The padding is a trailing line comment of ASCII, where one character is one
 * byte. CloudFront measures the source as uploaded, and the comment counts.
 */
function sourceOfBytes(byteLength: number): Buffer {
  return Buffer.from(handlerSource.padEnd(byteLength, "x"));
}

describe("The size of a CloudFront Function's code", () => {
  it("refuses source over the CloudFront limit", async () => {
    // Given source one byte over what CloudFront takes
    const simAws = new SimAws();
    const source = sourceOfBytes(maxCffCodeBytes + 1);

    // When a Function is created from it
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.cloudFront().createFunction(
          new CreateFunctionCommand({
            Name: "oversized",
            FunctionConfig: {
              Comment: "Too much source",
              Runtime: "cloudfront-js-2.0",
            },
            FunctionCode: source,
          }),
        ),
    );

    // Then CloudFront refuses it the way the real service does
    assertInstanceOf(error, SimCloudFrontFunctionSizeLimitExceeded);
    assertIdentical(error.name, "FunctionSizeLimitExceeded");
    assertIdentical(error.$metadata.httpStatusCode, 413);

    // And the message names both byte counts
    assertStringIncludes(error.message, String(maxCffCodeBytes + 1));
    assertStringIncludes(error.message, String(maxCffCodeBytes));

    // And the Function was never created
    assertUndefined(
      simAws.cloudFront().getCloudFrontFunctionByName("oversized"),
    );
  });

  it("takes source at exactly the limit", async () => {
    // Given source of exactly the most CloudFront takes
    const simAws = new SimAws();
    const source = sourceOfBytes(maxCffCodeBytes);
    assertIdentical(source.byteLength, maxCffCodeBytes);

    // When a Function is created from it
    await simAws.cloudFront().createFunction(
      new CreateFunctionCommand({
        Name: "at-the-limit",
        FunctionConfig: {
          Comment: "Exactly the limit",
          Runtime: "cloudfront-js-2.0",
        },
        FunctionCode: source,
      }),
    );

    // Then the Function exists and runs
    const cff = simAws.cloudFront().getCloudFrontFunctionByName("at-the-limit");
    assertNonNullable(cff);

    const result = await cff.handleViewerRequest(
      new Request("https://example.cloudfront.net/object.json"),
    );
    assertIdentical(new URL(result.url).pathname, "/object.json");
  });

  it("takes a bound handler with no source to measure", async () => {
    // Given a handler function reference in place of source
    const simAws = new SimAws();

    // When a Function is created from it
    await simAws.cloudFront().createFunction(
      new CreateFunctionCommand({
        Name: "bound",
        FunctionConfig: {
          Comment: "A handler reference",
          Runtime: "cloudfront-js-2.0",
        },
        FunctionCode: makeCffFunctionCodeInput(passThroughHandler),
      }),
    );

    // Then the limit has nothing to say about it
    assertNonNullable(simAws.cloudFront().getCloudFrontFunctionByName("bound"));
  });
});

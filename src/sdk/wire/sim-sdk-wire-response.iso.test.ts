import { assertIdentical, assertObjectMatches } from "@kensio/smartass";
import { describe, it } from "vitest";
import {
  simSdkWireErrorResponse,
  simSdkWireOutputResponse,
} from "./sim-sdk-wire-response.js";
import type { SimSdkWireResponse } from "./sim-sdk-wire.types.js";

function responseBody(response: SimSdkWireResponse): Record<string, unknown> {
  return JSON.parse(Buffer.from(response.body).toString()) as Record<
    string,
    unknown
  >;
}

describe("simulated AWS SDK wire response", () => {
  it("answers an operation that returned nothing with an empty document", () => {
    // Given an operation whose simulated implementation returns nothing, as
    // one with no output members may.
    // When its response is built.
    const response = simSdkWireOutputResponse(undefined);

    // Then the SDK reads an empty document rather than an empty body, which
    // is what the protocol carries for an output with no members.
    assertIdentical(response.statusCode, 200);
    assertIdentical(Buffer.from(response.body).toString(), "{}");
    assertIdentical(
      response.headers["content-type"],
      "application/x-amz-json-1.0",
    );
  });

  it("answers a failure that is not an Error as an internal one", () => {
    // Given something thrown that is not an Error at all, which means the
    // simulator went wrong rather than the request.
    // When its response is built.
    const response = simSdkWireErrorResponse("something went wrong");

    // Then it is reported as the server fault it is, with what was thrown,
    // rather than leaving the SDK with nothing to report.
    assertIdentical(response.statusCode, 500);
    assertIdentical(response.headers["x-amzn-errortype"], "InternalFailure");
    assertObjectMatches(responseBody(response), {
      __type: "InternalFailure",
      message: "something went wrong",
    });
  });
});

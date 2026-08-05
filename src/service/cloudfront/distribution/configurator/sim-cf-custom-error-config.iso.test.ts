import { describe, it } from "vitest";
import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import {
  CreateDistributionCommand,
  type CustomErrorResponse,
} from "@aws-sdk/client-cloudfront";

import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimCloudFrontInvalidArgument,
  SimCloudFrontInvalidErrorCode,
  SimCloudFrontInvalidResponseCode,
} from "../../error/sim-cloudfront.error.js";

/**
 * Create a Distribution carrying one custom error response, returning whatever
 * error refuses it.
 */
async function refusedCustomErrorResponse(
  customErrorResponse: CustomErrorResponse,
): Promise<Error> {
  return await assertThrowsErrorAsync(
    async () =>
      await new SimAws().cloudFront().createDistribution(
        new CreateDistributionCommand({
          DistributionConfig: {
            CallerReference: "custom-error-config",
            Comment: "Custom error response config",
            Enabled: true,
            Origins: { Quantity: 0, Items: [] },
            DefaultCacheBehavior: {
              TargetOriginId: "site-origin",
              ViewerProtocolPolicy: "allow-all",
            },
            CustomErrorResponses: {
              Quantity: 1,
              Items: [customErrorResponse],
            },
          },
        }),
      ),
  );
}

describe("Sim CloudFront custom error response configuration", () => {
  it("refuses a status code CloudFront has no custom error page for", async () => {
    // Given a rule for a status outside the set CloudFront supports.
    const error = await refusedCustomErrorResponse({
      ErrorCode: 418,
      ResponsePagePath: "/418.html",
      ResponseCode: "418",
    });

    // Then it is refused as InvalidErrorCode.
    assertInstanceOf(error, SimCloudFrontInvalidErrorCode);
    assertStringIncludes(error.message, "418");
  });

  it("refuses a response page with no response code", async () => {
    // Given a rule naming a page but not the status to serve it with, which
    // CloudFront requires together.
    const error = await refusedCustomErrorResponse({
      ErrorCode: 404,
      ResponsePagePath: "/404.html",
    });

    // Then it is refused rather than half applied.
    assertInstanceOf(error, SimCloudFrontInvalidArgument);
    assertStringIncludes(error.message, "ResponseCode");
  });

  it("refuses a response code with no response page", async () => {
    // Given a rule naming a status but no page to serve.
    const error = await refusedCustomErrorResponse({
      ErrorCode: 404,
      ResponseCode: "200",
    });

    // Then it is refused, as the pairing goes both ways in CloudFront.
    assertInstanceOf(error, SimCloudFrontInvalidArgument);
    assertStringIncludes(error.message, "ResponsePagePath");
  });

  it("refuses a response page path that is not a path from the root", async () => {
    // Given a response page written as an object key rather than a path, which
    // CloudFront cannot resolve against the Distribution.
    const error = await refusedCustomErrorResponse({
      ErrorCode: 404,
      ResponsePagePath: "404.html",
      ResponseCode: "404",
    });

    // Then it is refused.
    assertInstanceOf(error, SimCloudFrontInvalidArgument);
    assertStringIncludes(error.message, "forward slash");
  });

  it("refuses a response code that is not an HTTP status code", async () => {
    // Given a response code that is not a status.
    const error = await refusedCustomErrorResponse({
      ErrorCode: 404,
      ResponsePagePath: "/404.html",
      ResponseCode: "not-a-status",
    });

    // Then it is refused as InvalidResponseCode.
    assertInstanceOf(error, SimCloudFrontInvalidResponseCode);
    assertStringIncludes(error.message, "not-a-status");
  });
});

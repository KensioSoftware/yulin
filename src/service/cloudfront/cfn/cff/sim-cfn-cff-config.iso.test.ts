import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimCloudFrontFunction } from "../../cff/sim-cloudfront-function.js";
import { maxCffCodeBytes } from "../../command/create-function/create-function-code-size.js";

describe("Sim CloudFormation CloudFront Function configuration", () => {
  it("creates a CloudFront Function when FunctionConfig is omitted", async () => {
    // Given a CloudFormation template with no FunctionConfig property.
    const simAws = new SimAws();

    const stack = await simAws.cloudFormation().deployTemplate({
      template: {
        Resources: {
          DefaultConfigFunction: {
            Type: "AWS::CloudFront::Function",
            Properties: {
              Name: "default-config-function",
              FunctionCode: `
function handler(event) {
  return event.request;
}
`,
            },
          },
        },
      },
    });

    // When the Function resource is read from the deployed stack.
    const resource = stack.getResource("DefaultConfigFunction");

    // Then the Function was created successfully using the omitted config.
    assertNonNullable(resource);
    assertInstanceOf(resource.simResource, SimCloudFrontFunction);
    assertIdentical(resource.simResource.name, "default-config-function");
  });

  it("rejects a CloudFront Function template with non-object FunctionConfig", async () => {
    // Given a CloudFormation template with an invalid scalar FunctionConfig.
    const simAws = new SimAws();

    // When the template is deployed, then FunctionConfig validation rejects it.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.cloudFormation().deployTemplate({
        template: {
          Resources: {
            InvalidConfigFunction: {
              Type: "AWS::CloudFront::Function",
              Properties: {
                Name: "invalid-config-function",
                FunctionConfig: "not-an-object",
                FunctionCode: `
function handler(event) {
  return event.request;
}
`,
              },
            },
          },
        },
      }),
    );

    assertInstanceOf(error, TypeError);
    assertStringIncludes(
      error.message,
      "AWS::CloudFront::Function FunctionConfig must be an object",
    );
  });

  it("rejects a CloudFront Function template with non-string FunctionCode", async () => {
    // Given a CloudFormation template with an invalid non-string FunctionCode.
    const simAws = new SimAws();

    // When the template is deployed, then FunctionCode validation rejects it.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.cloudFormation().deployTemplate({
        template: {
          Resources: {
            InvalidCodeFunction: {
              Type: "AWS::CloudFront::Function",
              Properties: {
                Name: "invalid-code-function",
                FunctionConfig: {
                  Comment: "Invalid FunctionCode",
                  Runtime: "cloudfront-js-2.0",
                },
                FunctionCode: {
                  Handler: "handler",
                },
              },
            },
          },
        },
      }),
    );

    assertInstanceOf(error, TypeError);
    assertStringIncludes(
      error.message,
      "AWS::CloudFront::Function InvalidCodeFunction FunctionCode must be a string",
    );
  });

  it("rejects a CloudFront Function template with oversized FunctionCode", async () => {
    // Given a CloudFormation template whose inline FunctionCode is over the
    // CloudFront size limit.
    const simAws = new SimAws();
    const handlerSource =
      "function handler(event) { return event.request; }\n// ";
    const oversized = handlerSource.padEnd(maxCffCodeBytes + 1, "x");

    // When the template is deployed, then simulated CloudFront refuses it.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.cloudFormation().deployTemplate({
        template: {
          Resources: {
            OversizedFunction: {
              Type: "AWS::CloudFront::Function",
              Properties: {
                Name: "oversized-function",
                FunctionConfig: {
                  Comment: "Oversized FunctionCode",
                  Runtime: "cloudfront-js-2.0",
                },
                FunctionCode: oversized,
              },
            },
          },
        },
      }),
    );

    assertIdentical(error.name, "FunctionSizeLimitExceeded");
    assertStringIncludes(error.message, String(maxCffCodeBytes + 1));
  });
});

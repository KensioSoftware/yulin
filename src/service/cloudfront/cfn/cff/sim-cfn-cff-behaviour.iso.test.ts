import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import type { CloudFrontFunction } from "../../index.js";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimCloudFrontFunction } from "../../cff/sim-cloudfront-function.js";

describe("Sim CloudFormation CloudFront Function behaviour", () => {
  it("executes inline CFN FunctionCode", async () => {
    // Given a CloudFormation template with an inline CloudFront Function.
    const simAws = new SimAws();

    const stack = await simAws.cloudFormation().deployTemplate({
      template: {
        Resources: {
          RewriteFunction: {
            Type: "AWS::CloudFront::Function",
            Properties: {
              Name: "rewrite-function",
              FunctionConfig: {
                Comment: "Rewrite function",
                Runtime: "cloudfront-js-2.0",
              },
              FunctionCode: `
function handler(event) {
  event.request.uri = event.request.uri.replace("object.json", "foobar.html");
  return event.request;
}
`,
            },
          },
        },
      },
    });

    // When the created sim CloudFront Function handles a viewer request.
    const resource = stack.getResource("RewriteFunction");

    assertNonNullable(resource);
    assertInstanceOf(resource.simResource, SimCloudFrontFunction);

    const cloudFrontFunction = resource.simResource;

    assertIdentical(cloudFrontFunction.name, "rewrite-function");
    assertIdentical(resource.refValue, "rewrite-function");
    assertIdentical(
      resource.attributeValue("FunctionARN"),
      cloudFrontFunction.arn,
    );
    assertIdentical(
      resource.attributeValue("FunctionMetadata.FunctionARN"),
      cloudFrontFunction.arn,
    );

    const request = new Request("https://example.test/object.json");
    const result = cloudFrontFunction.handleViewerRequest(request);

    // Then the FunctionCode from the template is executed through the sim CFF.
    assertInstanceOf(result, Request);
    assertIdentical(new URL(result.url).pathname, "/foobar.html");
  });

  it("uses a logicalId binding instead of the template FunctionCode", async () => {
    // Given a CloudFront Function template and a binding matched by logical ID.
    const simAws = new SimAws();

    const stack = await simAws.cloudFormation().deployTemplate({
      template: {
        Resources: {
          RewriteFunction: {
            Type: "AWS::CloudFront::Function",
            Properties: {
              Name: "rewrite-function",
              FunctionConfig: {
                Comment: "Rewrite function",
                Runtime: "cloudfront-js-2.0",
              },
              FunctionCode: `
function handler(event) {
  event.request.uri = "/from-template.html";
  return event.request;
}
`,
            },
          },
        },
      },
      bindings: [
        {
          logicalId: "RewriteFunction",
          handler: (
            event: CloudFrontFunction.Event,
          ): CloudFrontFunction.Request => {
            event.request.uri = "/from-binding.html";
            return event.request;
          },
        },
      ],
    });

    // When the created sim CloudFront Function handles a viewer request.
    const resource = stack.getResource("RewriteFunction");

    assertNonNullable(resource);
    assertInstanceOf(resource.simResource, SimCloudFrontFunction);

    const result = resource.simResource.handleViewerRequest(
      new Request("https://example.test/original.html"),
    );

    // Then the bound handler is used instead of the template FunctionCode.
    assertInstanceOf(result, Request);
    assertIdentical(new URL(result.url).pathname, "/from-binding.html");
  });

  it("uses a functionName binding instead of the template FunctionCode", async () => {
    // Given a CloudFront Function template and a binding matched by Function name.
    const simAws = new SimAws();

    const stack = await simAws.cloudFormation().deployTemplate({
      template: {
        Resources: {
          RewriteFunction: {
            Type: "AWS::CloudFront::Function",
            Properties: {
              Name: "rewrite-function",
              FunctionConfig: {
                Comment: "Rewrite function",
                Runtime: "cloudfront-js-2.0",
              },
              FunctionCode: `
function handler(event) {
  event.request.uri = "/from-template.html";
  return event.request;
}
`,
            },
          },
        },
      },
      bindings: [
        {
          functionName: "rewrite-function",
          handler: (event: CloudFrontFunction.ViewerRequestEvent) => {
            event.request.uri = "/from-function-name-binding.html";
            return event.request;
          },
        },
      ],
    });

    // When the created sim CloudFront Function handles a viewer request.
    const resource = stack.getResource("RewriteFunction");

    assertNonNullable(resource);
    assertInstanceOf(resource.simResource, SimCloudFrontFunction);

    const result = resource.simResource.handleViewerRequest(
      new Request("https://example.test/original.html"),
    );

    // Then the bound handler is used instead of the template FunctionCode.
    assertInstanceOf(result, Request);
    assertIdentical(
      new URL(result.url).pathname,
      "/from-function-name-binding.html",
    );
  });
});

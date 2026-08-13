import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import type { CloudFrontFunction } from "../../../cloudfront/index.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimCloudFrontFunction } from "../../../cloudfront/cff/sim-cloudfront-function.js";
import { simCfnCffResourceFactory } from "../../resource/cfn/cloudfront/sim-cff-cfn.factory.js";
import { SimCfnExecBindingFinder } from "./sim-cfn-exec-binding-finder.js";

describe("Sim CloudFormation executable binding finder", () => {
  it("finds a logicalId binding from CDK construct path metadata when deploying a template", async () => {
    const simAws = new SimAws();

    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "TestStack",
      template: {
        Resources: {
          RewriteFunction48E73F66: {
            Type: "AWS::CloudFront::Function",
            Metadata: {
              "aws:cdk:path": "TestStack/RewriteFunction/Resource",
            },
            Properties: {
              FunctionConfig: {
                Runtime: "cloudfront-js-2.0",
              },
              FunctionCode: `
function handler(event) {
  return event.request;
}
`,
            },
          },
        },
        Outputs: {
          RewriteFunctionName: {
            Value: {
              Ref: "RewriteFunction48E73F66",
            },
          },
        },
      },
      bindings: [
        {
          logicalId: "RewriteFunction",
          handler: rewriteRequestToBoundHandler,
        },
      ],
    });

    assertIdentical(
      stack.outputs.get("RewriteFunctionName")?.value,
      "RewriteFunction48E73F66",
    );

    const resource = stack.getResource("RewriteFunction48E73F66");

    assertNonNullable(resource);
    assertInstanceOf(resource.simResource, SimCloudFrontFunction);

    const result = await resource.simResource.handleViewerRequest(
      new Request("https://example.test/original.html"),
    );

    assertInstanceOf(result, Request);
    const url = new URL(result.url);
    assertIdentical(url.pathname, "/bound-handler.html");
  });

  it("finds a logicalId binding from the final CDK path segment when deploying a template", async () => {
    const simAws = new SimAws();

    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "TestStack",
      template: {
        Resources: {
          RewriteFunction48E73F66: {
            Type: "AWS::CloudFront::Function",
            Metadata: {
              "aws:cdk:path": "TestStack/Nested/RewriteFunction",
            },
            Properties: {
              Name: "rewrite-function",
              FunctionConfig: {
                Runtime: "cloudfront-js-2.0",
              },
              FunctionCode: `
function handler(event) {
  return event.request;
}
`,
            },
          },
        },
        Outputs: {
          RewriteFunctionName: {
            Value: {
              Ref: "RewriteFunction48E73F66",
            },
          },
        },
      },
      bindings: [
        {
          logicalId: "RewriteFunction",
          handler: rewriteRequestToBoundHandler,
        },
      ],
    });

    assertIdentical(
      stack.outputs.get("RewriteFunctionName")?.value,
      "rewrite-function",
    );

    const resource = stack.getResource("RewriteFunction48E73F66");

    assertNonNullable(resource);
    assertInstanceOf(resource.simResource, SimCloudFrontFunction);

    const result = await resource.simResource.handleViewerRequest(
      new Request("https://example.test/original.html"),
    );

    assertInstanceOf(result, Request);
    const url = new URL(result.url);
    assertIdentical(url.pathname, "/bound-handler.html");
  });

  it("uses the first supported string CDK path metadata key when finding a binding directly", () => {
    const resource = simCfnCffResourceFactory.make({
      logicalId: "RewriteFunction48E73F66",
      metadata: {
        "aws:cdk:path": 42,
        "aws:cdk:logicalId": "RewriteFunction",
      },
    });
    const binding = {
      logicalId: "RewriteFunction",
      handler: rewriteRequestToBoundHandler,
    };
    const finder = new SimCfnExecBindingFinder({
      resource,
      bindings: [binding],
    });

    assertIdentical(
      finder.findBinding({ functionName: "RewriteFunction48E73F66" }),
      binding,
    );
  });

  it("ignores invalid CDK path metadata when finding a binding directly", () => {
    const cases = [
      {
        metadata: null,
      },
      {
        metadata: "TestStack/RewriteFunction/Resource",
      },
      {
        metadata: ["TestStack/RewriteFunction/Resource"],
      },
      {
        metadata: {
          "aws:cdk:path": 42,
          "aws:cdk:logicalId": false,
        },
      },
    ];

    for (const testCase of cases) {
      const resource = simCfnCffResourceFactory.make({
        logicalId: "RewriteFunction48E73F66",
        metadata: testCase.metadata,
      });
      const finder = new SimCfnExecBindingFinder({
        resource,
        bindings: [
          {
            logicalId: "RewriteFunction",
            handler: rewriteRequestToBoundHandler,
          },
        ],
      });

      assertUndefined(
        finder.findBinding({ functionName: "RewriteFunction48E73F66" }),
      );
    }
  });
});

function rewriteRequestToBoundHandler(
  event: CloudFrontFunction.ViewerRequestEvent,
): CloudFrontFunction.Request {
  event.request.uri = "/bound-handler.html";
  return event.request;
}

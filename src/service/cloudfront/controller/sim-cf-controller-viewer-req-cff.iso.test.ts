import {
  assertIdentical,
  assertNonNullable,
  assertResponseStatus,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import {
  CreateDistributionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-cloudfront";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { SimCloudFrontServiceController } from "./sim-cloudfront-controller.js";
import { makeCffFunctionCodeInput } from "../cff/function-code-input/cff-function-code-input.js";
import { makeAwsRegionName } from "../../aws/sim-aws-region.js";
import type { CloudFrontFunction } from "../typings/cloudfront-functions.namespace.js";

describe("Simulated CloudFront local HTTP controller CFF", () => {
  it("applies a CFF associated with a Distribution created through another Region in the same Account", async () => {
    const simAws = new SimAws();
    const regionA = makeAwsRegionName();
    const regionB = makeAwsRegionName();

    const cffOutput = await simAws
      .region(regionA)
      .cloudFront()
      .createFunction(
        new CreateFunctionCommand({
          Name: "same-account-cross-region-cff",
          FunctionConfig: {
            Comment: "Same Account cross-Region CFF",
            Runtime: "cloudfront-js-2.0",
          },
          FunctionCode: makeCffFunctionCodeInput(
            (event: CloudFrontFunction.ViewerRequestEvent) => ({
              statusCode: event.request.uri === "/index.html" ? 204 : 400,
              headers: {
                "x-cff-resolved": {
                  value: "same-account",
                },
              },
            }),
          ),
        }),
      );

    const distributionOutput = await simAws
      .region(regionB)
      .cloudFront()
      .createDistribution(
        new CreateDistributionCommand({
          DistributionConfig: {
            CallerReference: "same-account-cross-region-cff",
            Comment: "Same Account cross-Region CFF Distribution",
            Enabled: true,
            Origins: {
              Quantity: 0,
              Items: [],
            },
            DefaultCacheBehavior: {
              TargetOriginId: "unused-origin",
              ViewerProtocolPolicy: "allow-all",
              FunctionAssociations: {
                Quantity: 1,
                Items: [
                  {
                    EventType: "viewer-request",
                    FunctionARN: cffOutput.FunctionMetadata.FunctionARN,
                  },
                ],
              },
            },
          },
        }),
      );

    const distributionId = distributionOutput.Distribution?.Id;
    assertNonNullable(distributionId);

    const res = await new SimCloudFrontServiceController({
      simAws,
    }).handleRequest(
      {
        service: "cloudFront",
        resourceName: "",
      },
      new Request(
        `http://${distributionId}.cloudfront.net.sim-aws.localhost/index.html`,
      ),
    );

    assertResponseStatus(res, 204);
    assertIdentical(res.headers.get("x-cff-resolved"), "same-account");
  });

  it("does not resolve a CFF from another Account", async () => {
    const simAws = new SimAws();
    const accountA = "111111111111";
    const accountB = "222222222222";
    const functionName = "cross-account-cff";

    await simAws
      .account(accountA)
      .cloudFront()
      .createFunction(
        new CreateFunctionCommand({
          Name: functionName,
          FunctionConfig: {
            Comment: "Same-name CFF in Distribution Account",
            Runtime: "cloudfront-js-2.0",
          },
          FunctionCode: makeCffFunctionCodeInput(
            (event: CloudFrontFunction.ViewerRequestEvent) => {
              event.request.headers["x-cff-resolved"] = {
                value: "wrong-account",
              };
              return event.request;
            },
          ),
        }),
      );

    const accountBCffOutput = await simAws
      .account(accountB)
      .cloudFront()
      .createFunction(
        new CreateFunctionCommand({
          Name: functionName,
          FunctionConfig: {
            Comment: "CFF in another Account",
            Runtime: "cloudfront-js-2.0",
          },
          FunctionCode: makeCffFunctionCodeInput(
            (event: CloudFrontFunction.ViewerRequestEvent) => {
              event.request.headers["x-cff-resolved"] = {
                value: "other-account",
              };
              return event.request;
            },
          ),
        }),
      );

    const distributionOutput = await simAws
      .account(accountA)
      .cloudFront()
      .createDistribution(
        new CreateDistributionCommand({
          DistributionConfig: {
            CallerReference: "cross-account-cff",
            Comment: "Cross-Account CFF Distribution",
            Enabled: true,
            Origins: {
              Quantity: 0,
              Items: [],
            },
            DefaultCacheBehavior: {
              TargetOriginId: "unused-origin",
              ViewerProtocolPolicy: "allow-all",
              FunctionAssociations: {
                Quantity: 1,
                Items: [
                  {
                    EventType: "viewer-request",
                    FunctionARN: accountBCffOutput.FunctionMetadata.FunctionARN,
                  },
                ],
              },
            },
          },
        }),
      );

    const distributionId = distributionOutput.Distribution?.Id;
    assertNonNullable(distributionId);

    const error = await assertThrowsErrorAsync(async () => {
      await new SimCloudFrontServiceController({
        simAws,
      }).handleRequest(
        {
          service: "cloudFront",
          resourceName: "",
        },
        new Request(
          `http://${distributionId}.cloudfront.net.sim-aws.localhost/index.html`,
        ),
      );
    });

    assertStringIncludes(error.message, "CloudFront Function");
    assertStringIncludes(error.message, "for viewer-request");
  });
});

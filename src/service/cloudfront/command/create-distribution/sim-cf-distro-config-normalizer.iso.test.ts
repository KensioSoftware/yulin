import { describe, it } from "vitest";
import { SimCloudFrontDistributionConfigNormalizer } from "./sim-cf-distro-config-normalizer.js";
import type { SimCloudFrontDistributionConfig } from "./create-distribution.command.js";
import { assertIdentical } from "@kensio/smartass";

describe("sim CloudFront distro config normalizer", () => {
  it("normalizes DefaultCacheBehavior FunctionAssociations from CFN array shape", () => {
    const normalizer = new SimCloudFrontDistributionConfigNormalizer({
      DefaultCacheBehavior: {
        TargetOriginId: "SiteOrigin",
        FunctionAssociations: [
          {
            EventType: "viewer-request",
            FunctionARN: "arn:aws:cloudfront::111111111111:function/example",
          },
        ],
      },
    } as SimCloudFrontDistributionConfig);
    const normalized = normalizer.normalize();

    assertIdentical(
      normalized.DefaultCacheBehavior?.FunctionAssociations?.Items?.[0]
        ?.FunctionARN,
      "arn:aws:cloudfront::111111111111:function/example",
    );
  });
});

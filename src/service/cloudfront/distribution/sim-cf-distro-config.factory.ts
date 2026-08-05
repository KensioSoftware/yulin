import { DynamicFactory } from "@kensio/part-factory";
import type { SimCloudFrontDistributionConfig } from "../command/create-distribution/create-distribution.command.js";
import type { SimCfnTemplateValue } from "../../cloudformation/template/value/sim-cfn-template-value.js";

/**
 * Makes minimally valid simulated CloudFront DistributionConfig objects.
 */
export const simCfDistroConfigFactory = new DynamicFactory<
  SimCloudFrontDistributionConfig & SimCfnTemplateValue
>(() => ({
  Enabled: true,
  Origins: {
    Items: [
      {
        Id: "SiteOrigin",
        DomainName: "example-bucket.s3.amazonaws.com",
        S3OriginConfig: {},
      },
    ],
  },
  DefaultCacheBehavior: {
    TargetOriginId: "SiteOrigin",
    ViewerProtocolPolicy: "allow-all",
  },
}));

import { CreateDistributionCommand } from "@aws-sdk/client-cloudfront";
import { AsyncMappedFactory } from "@kensio/part-factory";
import { assertNonNullable } from "@kensio/smartass";

import type { SimAws } from "../../src/service/aws/sim-aws.js";

/**
 * What the pipeline asks for when it wants somewhere to serve renditions from.
 */
export interface MediaDeliveryDistributionInput {
  readonly originBucketName: string;
  readonly originId: string;
  readonly callerReference: string;
  readonly comment: string;
}

/**
 * Creates the Distribution renditions are delivered through, and answers with
 * the domain name the API hands out.
 *
 * ```typescript
 * const domainName = await mediaDeliveryDistributionFactory.make({}, simAws);
 * ```
 *
 * The domain is what makes the pipeline's URLs worth asserting on: a client is
 * given the Distribution rather than the Bucket, so fetching one of those URLs
 * says the Object is reachable the way a browser would reach it.
 */
export const mediaDeliveryDistributionFactory = new AsyncMappedFactory<
  MediaDeliveryDistributionInput,
  string,
  SimAws
>(
  () => ({
    originBucketName: "image-uploads",
    originId: "images-origin",
    callerReference: "image-delivery",
    comment: "Image delivery",
  }),
  async (input, simAws) => {
    const created = await simAws.cloudFront().createDistribution(
      new CreateDistributionCommand({
        DistributionConfig: {
          CallerReference: input.callerReference,
          Comment: input.comment,
          Enabled: true,
          Origins: {
            Quantity: 1,
            Items: [
              {
                Id: input.originId,
                DomainName: `${input.originBucketName}.s3.amazonaws.com`,
                S3OriginConfig: { OriginAccessIdentity: "" },
              },
            ],
          },
          DefaultCacheBehavior: {
            TargetOriginId: input.originId,
            ViewerProtocolPolicy: "allow-all",
          },
        },
      }),
    );

    const domainName = created.Distribution?.DomainName;
    assertNonNullable(domainName, "The Distribution has a domain name");

    return domainName;
  },
);

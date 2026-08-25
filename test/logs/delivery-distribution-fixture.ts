/**
 * The CloudFront Distributions the delivery tests put delivery sources over.
 *
 * Simulated CloudWatch Logs resolves a delivery source's `resourceArn` in the
 * account creating it. A test about delivery therefore needs a Distribution
 * behind the ARN it names. Nothing is ever served from these, and the Origin
 * is a custom one over a host name that answers nowhere. That spares every
 * delivery test a Bucket it would never read.
 */

import { CreateDistributionCommand } from "@aws-sdk/client-cloudfront";
import { assertNonNullable } from "@kensio/smartass";

import type { SimAws } from "../../src/service/aws/sim-aws.js";

/**
 * Create a Distribution in the simulated account and return its ARN.
 *
 * The name separates one Distribution from another in a test that needs
 * several, because a `CallerReference` belongs to one Distribution.
 */
export async function simLogsDeliveryDistributionArn(
  simAws: SimAws,
  name = "access-logs-site",
): Promise<string> {
  const created = await simAws.cloudFront().createDistribution(
    new CreateDistributionCommand({
      DistributionConfig: {
        CallerReference: name,
        Comment: `Distribution for ${name}`,
        Enabled: true,
        Origins: {
          Quantity: 1,
          Items: [
            {
              Id: "delivery-origin",
              DomainName: `${name}.example.test`,
              CustomOriginConfig: {
                HTTPPort: 80,
                HTTPSPort: 443,
                OriginProtocolPolicy: "https-only",
              },
            },
          ],
        },
        DefaultCacheBehavior: {
          TargetOriginId: "delivery-origin",
          ViewerProtocolPolicy: "allow-all",
        },
      },
    }),
  );

  assertNonNullable(created.Distribution?.Id);

  return simLogsDistributionArn(simAws, created.Distribution.Id);
}

/**
 * The ARN of a Distribution id in the simulated account.
 */
export function simLogsDistributionArn(
  simAws: SimAws,
  distributionId: string,
): string {
  return `arn:aws:cloudfront::${simAws.account().accountId}:distribution/${distributionId}`;
}

/**
 * The logical id of the Distribution a delivery template declares.
 */
export const deliveryDistributionLogicalId = "SiteDistribution";

/**
 * An `AWS::CloudFront::Distribution` for a delivery source to be over.
 *
 * A template that turns standard logging v2 on names a Distribution it
 * declares itself. This is what goes in the template beside the three
 * delivery Resources.
 */
export const deliveryDistributionResource = {
  Type: "AWS::CloudFront::Distribution",
  Properties: {
    DistributionConfig: {
      Enabled: true,
      Origins: {
        Items: [
          {
            Id: "delivery-origin",
            DomainName: "site.example.test",
            CustomOriginConfig: { OriginProtocolPolicy: "https-only" },
          },
        ],
      },
      DefaultCacheBehavior: {
        TargetOriginId: "delivery-origin",
        ViewerProtocolPolicy: "allow-all",
      },
    },
  },
};

/**
 * The `ResourceArn` of that Distribution, built the way CDK builds an ARN.
 *
 * `Ref` on an `AWS::CloudFront::Distribution` is the id it was given, and the
 * ARN is assembled around that `Ref`. Reading one is also what makes the
 * delivery source wait for the Distribution.
 */
export const deliveryDistributionResourceArn = {
  "Fn::Join": [
    "",
    [
      "arn:",
      { Ref: "AWS::Partition" },
      ":cloudfront::",
      { Ref: "AWS::AccountId" },
      ":distribution/",
      { Ref: deliveryDistributionLogicalId },
    ],
  ],
};

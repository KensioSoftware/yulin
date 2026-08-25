/**
 * Setting up CloudFront standard logging v2 delivery into a bucket.
 */

import { CreateDistributionCommand } from "@aws-sdk/client-cloudfront";
import {
  CreateDeliveryCommand,
  DescribeDeliveriesCommand,
  PutDeliveryDestinationCommand,
  PutDeliverySourceCommand,
} from "@aws-sdk/client-cloudwatch-logs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const logs = simAws.logs();

const distribution = await simAws.cloudFront().createDistribution(
  new CreateDistributionCommand({
    DistributionConfig: {
      CallerReference: "site",
      Comment: "Static site distribution",
      Enabled: true,
      Origins: {
        Quantity: 1,
        Items: [
          {
            Id: "site-origin",
            DomainName: "origin.example.com",
            CustomOriginConfig: {
              HTTPPort: 80,
              HTTPSPort: 443,
              OriginProtocolPolicy: "https-only",
            },
          },
        ],
      },
      DefaultCacheBehavior: {
        TargetOriginId: "site-origin",
        ViewerProtocolPolicy: "redirect-to-https",
      },
    },
  }),
);

await logs.putDeliverySource(
  new PutDeliverySourceCommand({
    name: "site-access-logs",
    resourceArn: `arn:aws:cloudfront::${simAws.defaultAccountId}:distribution/${distribution.Distribution?.Id}`,
    logType: "ACCESS_LOGS",
  }),
);

const destination = await logs.putDeliveryDestination(
  new PutDeliveryDestinationCommand({
    name: "site-access-logs",
    outputFormat: "json",
    deliveryDestinationConfiguration: {
      destinationResourceArn: "arn:aws:s3:::example-access-logs",
    },
  }),
);

await logs.createDelivery(
  new CreateDeliveryCommand({
    deliverySourceName: "site-access-logs",
    deliveryDestinationArn: destination.deliveryDestination?.arn,
    s3DeliveryConfiguration: {
      suffixPath: "{DistributionId}/{yyyy}/{MM}/{dd}/{HH}",
      enableHiveCompatiblePath: true,
    },
  }),
);

const deliveries = await logs.describeDeliveries(
  new DescribeDeliveriesCommand({}),
);

// S3, and the layout the bucket will be partitioned by.
console.log(
  deliveries.deliveries?.[0]?.deliveryDestinationType,
  deliveries.deliveries?.[0]?.s3DeliveryConfiguration?.suffixPath,
);

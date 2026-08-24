/**
 * Setting up CloudFront standard logging v2 delivery into a bucket.
 */

import {
  CreateDeliveryCommand,
  DescribeDeliveriesCommand,
  PutDeliveryDestinationCommand,
  PutDeliverySourceCommand,
} from "@aws-sdk/client-cloudwatch-logs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const logs = simAws.logs();

await logs.putDeliverySource(
  new PutDeliverySourceCommand({
    name: "site-access-logs",
    resourceArn: "arn:aws:cloudfront::123456789012:distribution/E1EXAMPLE",
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

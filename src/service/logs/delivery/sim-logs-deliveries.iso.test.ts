import {
  CreateDeliveryCommand,
  DeleteDeliveryCommand,
  DescribeDeliveriesCommand,
  PutDeliveryDestinationCommand,
  PutDeliverySourceCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import {
  assertArrayEquals,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";

const distributionArn = "arn:aws:cloudfront::123456789012:distribution/E1EX";
const bucketArn = "arn:aws:s3:::example-access-logs";
const sourceName = "site-access-logs";
const destinationName = "site-access-logs";
const suffixPath = "{DistributionId}/{yyyy}/{MM}/{dd}/{HH}";

/**
 * The source and destination a delivery joins, and the destination's ARN.
 */
async function givenSourceAndDestination(simAws: SimAws): Promise<string> {
  await simAws.logs().putDeliverySource(
    new PutDeliverySourceCommand({
      name: sourceName,
      resourceArn: distributionArn,
      logType: "ACCESS_LOGS",
    }),
  );

  const put = await simAws.logs().putDeliveryDestination(
    new PutDeliveryDestinationCommand({
      name: destinationName,
      deliveryDestinationConfiguration: {
        destinationResourceArn: bucketArn,
      },
    }),
  );

  return put.deliveryDestination?.arn ?? "";
}

describe("simulated CloudWatch Logs deliveries", () => {
  it("joins a delivery source to a delivery destination", async () => {
    // Given a delivery source over a distribution and a destination over a
    // bucket.
    const simAws = new SimAws();
    const deliveryDestinationArn = await givenSourceAndDestination(simAws);

    // When a delivery joins the two.
    const created = await simAws.logs().createDelivery(
      new CreateDeliveryCommand({
        deliverySourceName: sourceName,
        deliveryDestinationArn,
      }),
    );

    // Then it comes back under an identifier CloudWatch Logs issued, carrying
    // the kind of destination it reaches.
    const delivery = created.delivery;

    assertNonNullable(delivery);
    assertIdentical(delivery.deliverySourceName, sourceName);
    assertIdentical(delivery.deliveryDestinationType, "S3");
    assertStringIncludes(delivery.arn, `:delivery:${delivery.id}`);
  });

  it("keeps the S3 layout a delivery was created with", async () => {
    // Given a delivery source and an S3 destination.
    const simAws = new SimAws();
    const deliveryDestinationArn = await givenSourceAndDestination(simAws);

    // When a delivery asks for Hive compatible paths under a suffix path.
    const created = await simAws.logs().createDelivery(
      new CreateDeliveryCommand({
        deliverySourceName: sourceName,
        deliveryDestinationArn,
        s3DeliveryConfiguration: {
          suffixPath,
          enableHiveCompatiblePath: true,
        },
      }),
    );

    // Then both read back, which is what a test of a logging construct has to
    // assert on.
    const configuration = created.delivery?.s3DeliveryConfiguration;

    assertNonNullable(configuration);
    assertIdentical(configuration.suffixPath, suffixPath);
    assertTrue(configuration.enableHiveCompatiblePath ?? false);
  });

  it("describes the deliveries in the account", async () => {
    // Given a delivery.
    const simAws = new SimAws();
    const deliveryDestinationArn = await givenSourceAndDestination(simAws);

    await simAws.logs().createDelivery(
      new CreateDeliveryCommand({
        deliverySourceName: sourceName,
        deliveryDestinationArn,
      }),
    );

    // When the deliveries are described.
    const described = await simAws
      .logs()
      .describeDeliveries(new DescribeDeliveriesCommand({}));

    // Then the delivery is reported with the source it carries logs from.
    assertArrayEquals(
      (described.deliveries ?? []).map(
        (delivery) => delivery.deliverySourceName,
      ),
      [sourceName],
    );
  });

  it("deletes a delivery and leaves its source and destination", async () => {
    // Given a delivery.
    const simAws = new SimAws();
    const deliveryDestinationArn = await givenSourceAndDestination(simAws);
    const created = await simAws.logs().createDelivery(
      new CreateDeliveryCommand({
        deliverySourceName: sourceName,
        deliveryDestinationArn,
      }),
    );
    const id = created.delivery?.id ?? "";

    // When the delivery is deleted.
    await simAws.logs().deleteDelivery(new DeleteDeliveryCommand({ id }));

    // Then only the join is gone: the source and destination are still there
    // for another delivery to use.
    assertUndefined(simAws.logs().findDelivery(id));
    assertNonNullable(simAws.logs().findDeliverySource(sourceName));
    assertNonNullable(simAws.logs().findDeliveryDestination(destinationName));
  });
});

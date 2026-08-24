import {
  DeleteDeliveryDestinationCommand,
  DescribeDeliveryDestinationsCommand,
  type OutputFormat,
  PutDeliveryDestinationCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import {
  assertArrayEquals,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";

const bucketArn = "arn:aws:s3:::example-access-logs";
const destinationName = "site-access-logs";

async function putDestination(
  simAws: SimAws,
  name: string,
  destinationResourceArn: string,
  outputFormat?: OutputFormat,
): Promise<void> {
  await simAws.logs().putDeliveryDestination(
    new PutDeliveryDestinationCommand({
      name,
      outputFormat,
      deliveryDestinationConfiguration: { destinationResourceArn },
    }),
  );
}

describe("simulated CloudWatch Logs delivery destinations", () => {
  it("puts a delivery destination over a bucket", async () => {
    // Given a simulated account.
    const simAws = new SimAws();

    // When a delivery destination is put over a bucket without naming a
    // format.
    const put = await simAws.logs().putDeliveryDestination(
      new PutDeliveryDestinationCommand({
        name: destinationName,
        deliveryDestinationConfiguration: {
          destinationResourceArn: bucketArn,
        },
      }),
    );

    // Then the kind of destination is read off the ARN and the format is the
    // AWS default.
    const destination = put.deliveryDestination;

    assertNonNullable(destination);
    assertIdentical(destination.deliveryDestinationType, "S3");
    assertIdentical(destination.outputFormat, "json");
    assertIdentical(
      destination.deliveryDestinationConfiguration.destinationResourceArn,
      bucketArn,
    );
    assertStringIncludes(
      destination.arn,
      `:delivery-destination:${destinationName}`,
    );
  });

  it("reads the destination kind off a log group or stream ARN", async () => {
    // Given a simulated account.
    const simAws = new SimAws();

    // When delivery destinations are put over a log group and a delivery
    // stream.
    await putDestination(
      simAws,
      "to-log-group",
      "arn:aws:logs:us-east-1:123456789012:log-group:/aws/vendedlogs/site",
    );
    await putDestination(
      simAws,
      "to-firehose",
      "arn:aws:firehose:us-east-1:123456789012:deliverystream/site",
    );

    // Then each reports the abbreviation CloudWatch Logs uses for its kind.
    assertIdentical(
      simAws.logs().findDeliveryDestination("to-log-group")?.destinationType,
      "CWL",
    );
    assertIdentical(
      simAws.logs().findDeliveryDestination("to-firehose")?.destinationType,
      "FH",
    );
  });

  it("takes parquet on an S3 destination", async () => {
    // Given a simulated account.
    const simAws = new SimAws();

    // When a destination over a bucket asks for parquet.
    await putDestination(simAws, destinationName, bucketArn, "parquet");

    // Then it is accepted, since S3 is the one kind that holds it.
    assertIdentical(
      simAws.logs().findDeliveryDestination(destinationName)?.outputFormat,
      "parquet",
    );
  });

  it("describes the delivery destinations in the account", async () => {
    // Given two delivery destinations.
    const simAws = new SimAws();

    await putDestination(simAws, destinationName, bucketArn);
    await putDestination(simAws, "other-access-logs", `${bucketArn}-other`);

    // When they are described.
    const described = await simAws
      .logs()
      .describeDeliveryDestinations(
        new DescribeDeliveryDestinationsCommand({}),
      );

    // Then both are reported, in the order they were put.
    assertArrayEquals(
      (described.deliveryDestinations ?? []).map(
        (destination) => destination.name,
      ),
      [destinationName, "other-access-logs"],
    );
  });

  it("deletes a delivery destination", async () => {
    // Given a delivery destination.
    const simAws = new SimAws();

    await putDestination(simAws, destinationName, bucketArn);

    // When it is deleted.
    await simAws
      .logs()
      .deleteDeliveryDestination(
        new DeleteDeliveryDestinationCommand({ name: destinationName }),
      );

    // Then it is gone.
    assertUndefined(simAws.logs().findDeliveryDestination(destinationName));
  });
});

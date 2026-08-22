import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimCfnDeployedStack } from "../../cloudformation/stack/sim-cfn-deployed-stack.type.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import {
  cdkS3Destination,
  simCfnFirehoseDeliveryStreamTemplateFactory,
} from "./sim-cfn-firehose-delivery-stream-template.factory.js";

describe("What a deployed AWS::KinesisFirehose::DeliveryStream leaves out", () => {
  /**
   * Deploy a delivery stream declared with the given properties.
   */
  async function deploy(
    simAws: SimAws,
    deliveryStreamProperties: SimCfnTemplateValueRecord,
  ): Promise<SimCfnDeployedStack> {
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: simCfnFirehoseDeliveryStreamTemplateFactory.make({
        deliveryStreamProperties,
      }),
    });
    await stack.waitForDeployComplete();

    return stack;
  }

  /**
   * The reasons recorded against the Resource for one property path.
   */
  function ignoredReasons(
    stack: SimCfnDeployedStack,
    path: string,
  ): readonly string[] {
    return stack.resources
      .flatMap((resource) => [...resource.ignoredProperties])
      .filter((property) => property.path === path)
      .map((property) => property.reason);
  }

  it("records encryption as unsimulated and deploys the delivery stream", async () => {
    // Given a template asking for a delivery stream encrypted with a KMS key.
    const simAws = new SimAws();

    // When it is deployed.
    const stack = await deploy(simAws, {
      DeliveryStreamName: "order-events",
      DeliveryStreamEncryptionConfigurationInput: {
        KeyType: "AWS_OWNED_CMK",
      },
      ExtendedS3DestinationConfiguration: cdkS3Destination,
    });

    // Then the delivery stream is there, and the property it could not act on
    // is recorded where a test can find it rather than failing the stack.
    assertIdentical(
      simAws.firehose().findDeliveryStream("order-events")?.name,
      "order-events",
    );

    const reasons = ignoredReasons(
      stack,
      "DeliveryStreamEncryptionConfigurationInput",
    );
    assertArrayLength(reasons, 1);
    assertStringIncludes(reasons[0], "encryption is not simulated");
  });

  it("records the destination properties it delivers without", async () => {
    // Given the destination CDK synthesizes, which always logs to CloudWatch,
    // alongside a transformation and a partitioning this simulation has no
    // behaviour for.
    const simAws = new SimAws();

    // When it is deployed.
    const stack = await deploy(simAws, {
      DeliveryStreamName: "order-events",
      ExtendedS3DestinationConfiguration: {
        ...cdkS3Destination,
        CloudWatchLoggingOptions: {
          Enabled: true,
          LogGroupName: "orders",
          LogStreamName: "S3Destination",
        },
        ProcessingConfiguration: { Enabled: false },
        CompressionFormat: "GZIP",
      },
    });

    // Then each is recorded under the destination it was written in, and the
    // delivery stream is deployed anyway.
    assertIdentical(
      simAws.firehose().findDeliveryStream("order-events")?.name,
      "order-events",
    );
    assertArrayLength(
      ignoredReasons(
        stack,
        "ExtendedS3DestinationConfiguration.CloudWatchLoggingOptions",
      ),
      1,
    );
    assertArrayLength(
      ignoredReasons(
        stack,
        "ExtendedS3DestinationConfiguration.ProcessingConfiguration",
      ),
      1,
    );
    assertStringIncludes(
      ignoredReasons(
        stack,
        "ExtendedS3DestinationConfiguration.CompressionFormat",
      )[0] ?? "",
      "UNCOMPRESSED",
    );
  });

  it("deploys a plain S3DestinationConfiguration", async () => {
    // Given a template declaring the plain destination rather than the
    // extended one CDK synthesizes.
    const simAws = new SimAws();

    // When it is deployed.
    await deploy(simAws, {
      DeliveryStreamName: "order-events",
      S3DestinationConfiguration: cdkS3Destination,
    });

    // Then the delivery stream is there, since every field this simulation
    // reads is on both forms.
    assertIdentical(
      simAws.firehose().findDeliveryStream("order-events")?.destination.prefix,
      "orders/",
    );
  });

  it("gives a destination declaring no buffering the Firehose defaults", async () => {
    // Given a destination naming a Bucket and a Role and nothing else, which
    // is the least CloudFormation accepts.
    const simAws = new SimAws();

    // When it is deployed.
    await deploy(simAws, {
      DeliveryStreamName: "order-events",
      ExtendedS3DestinationConfiguration: {
        BucketARN: { "Fn::GetAtt": ["OrderArchive", "Arn"] },
        RoleARN: { "Fn::GetAtt": ["DeliveryRole", "Arn"] },
      },
    });

    // Then the delivery stream buffers the way real Firehose buffers one that
    // was told nothing. That is 5 MB or 300 seconds.
    const hints = simAws.firehose().findDeliveryStream("order-events")
      ?.destination.bufferingHints;
    assertNonNullable(hints);
    assertIdentical(hints.sizeInMegabytes, 5);
    assertIdentical(hints.intervalInSeconds, 300);
  });

  it("skips a delivery stream whose destination is outside the simulation", async () => {
    // Given a template whose only destination is Redshift.
    const simAws = new SimAws();

    // When it is deployed.
    const stack = await deploy(simAws, {
      DeliveryStreamName: "order-events",
      RedshiftDestinationConfiguration: {
        ClusterJDBCURL:
          "jdbc:redshift://orders.eu-west-2.redshift.amazonaws.com:5439/orders",
        RoleARN: { "Fn::GetAtt": ["DeliveryRole", "Arn"] },
      },
    });

    // Then the delivery stream was not created, the rest of the stack was, and
    // the skip says which destination it could not deliver to.
    assertUndefined(simAws.firehose().findDeliveryStream("order-events"));
    assertIdentical(stack.status, "CREATE_COMPLETE");
    assertArrayLength(stack.skippedResources, 1);
    assertStringIncludes(
      stack.skippedResources[0].skippedReason ?? "",
      "RedshiftDestinationConfiguration",
    );
  });

  it("takes tags without listing them back", async () => {
    // Given a template tagging its delivery stream.
    const simAws = new SimAws();

    // When it is deployed.
    await deploy(simAws, {
      DeliveryStreamName: "order-events",
      Tags: [{ Key: "team", Value: "orders" }],
      ExtendedS3DestinationConfiguration: cdkS3Destination,
    });

    // Then the delivery stream is there. Tags go the same way through a
    // template as through CreateDeliveryStream, which is accepted and never
    // listed back.
    assertIdentical(
      simAws.firehose().findDeliveryStream("order-events")?.name,
      "order-events",
    );
  });
});

import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimCfnDeployedResource } from "../../cloudformation/resource/sim-cfn-deployed-resource.type.js";
import type { SimCfnDeployedStack } from "../../cloudformation/stack/sim-cfn-deployed-stack.type.js";
import {
  deployedResourceObject,
  deployedStackObject,
} from "../../cloudformation/stack/sim-cfn-stack.fixture.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import { simCfnFirehoseResourceCreation } from "./sim-cfn-firehose-resource-error.js";
import {
  cdkS3Destination,
  simCfnFirehoseDeliveryStreamTemplateFactory,
} from "./sim-cfn-firehose-delivery-stream-template.factory.js";

describe("What a deployed AWS::KinesisFirehose::DeliveryStream refuses", () => {
  /**
   * Deploy a delivery stream declared with the given properties, giving back
   * whatever the deployment was refused with.
   */
  async function refusalFrom(
    deliveryStreamProperties: SimCfnTemplateValueRecord,
  ): Promise<Error> {
    const simAws = new SimAws();

    return await assertThrowsErrorAsync(async () => {
      const stack = await simAws.cloudFormation().deployTemplate({
        stackName: "orders-stack",
        template: simCfnFirehoseDeliveryStreamTemplateFactory.make({
          deliveryStreamProperties,
        }),
      });
      await stack.waitForDeployComplete();
    });
  }

  /**
   * A deployed delivery stream, the stack that holds it and the simulation it
   * is in.
   */
  async function deployedDeliveryStream(): Promise<{
    readonly simAws: SimAws;
    readonly stack: SimCfnDeployedStack;
    readonly resource: SimCfnDeployedResource;
  }> {
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: simCfnFirehoseDeliveryStreamTemplateFactory.make(),
    });
    await stack.waitForDeployComplete();

    const resource = stack.getResource("OrderEvents");
    assertNonNullable(resource);

    return { simAws, stack, resource };
  }

  it("refuses a delivery stream name Firehose would not accept", async () => {
    // When a template declares a delivery stream with a slash in its name.
    const error = await refusalFrom({
      DeliveryStreamName: "orders/live",
      ExtendedS3DestinationConfiguration: cdkS3Destination,
    });

    // Then the deployment is refused rather than deploying a delivery stream
    // nothing could reach by the name the template used, with the Resource
    // named so the template can be found.
    assertStringIncludes(error.message, "OrderEvents");
    assertStringIncludes(error.message, "letters, digits");
  });

  it("refuses buffering hints Firehose would not accept", async () => {
    // When a template asks to buffer for longer than Firehose ever holds one.
    const error = await refusalFrom({
      DeliveryStreamName: "order-events",
      ExtendedS3DestinationConfiguration: {
        ...cdkS3Destination,
        BufferingHints: { IntervalInSeconds: 1000 },
      },
    });

    // Then the deployment is refused in the words CreateDeliveryStream refuses
    // it in.
    assertStringIncludes(error.message, "IntervalInSeconds");
  });

  it("refuses a destination naming no Bucket", async () => {
    // When a template names an Object rather than a Bucket.
    const error = await refusalFrom({
      DeliveryStreamName: "order-events",
      ExtendedS3DestinationConfiguration: {
        ...cdkS3Destination,
        BucketARN: "arn:aws:s3:::order-archive/orders",
      },
    });

    // Then the deployment is refused.
    assertStringIncludes(error.message, "does not name a Bucket");
  });

  it("refuses a delivery stream declaring no destination", async () => {
    // When a template declares a delivery stream and nowhere to write it.
    const error = await refusalFrom({ DeliveryStreamName: "order-events" });

    // Then the deployment is refused, as real CloudFormation refuses it, since
    // there is nothing here for a test to assert against.
    assertStringIncludes(error.message, "declares no destination");
  });

  it("refuses a template declaring both S3 destinations", async () => {
    // When a template declares the same destination twice, in the extended
    // form and the plain one.
    const error = await refusalFrom({
      DeliveryStreamName: "order-events",
      ExtendedS3DestinationConfiguration: cdkS3Destination,
      S3DestinationConfiguration: cdkS3Destination,
    });

    // Then the deployment is refused, as real CloudFormation refuses a
    // Resource naming more than one destination.
    assertStringIncludes(error.message, "OrderEvents");
    assertStringIncludes(error.message, "one destination");
  });

  it("refuses a property whose shape the template got wrong", async () => {
    // Given templates that put the wrong kind of value in each place.
    const wrongShapes: readonly (readonly [
      SimCfnTemplateValueRecord,
      string,
    ])[] = [
      [
        { DeliveryStreamName: 7, ExtendedS3DestinationConfiguration: {} },
        "DeliveryStreamName must be a string",
      ],
      [
        {
          DeliveryStreamType: 7,
          ExtendedS3DestinationConfiguration: cdkS3Destination,
        },
        "DeliveryStreamType must be a string",
      ],
      [
        { ExtendedS3DestinationConfiguration: "order-archive" },
        "ExtendedS3DestinationConfiguration must be an object",
      ],
      [
        { ExtendedS3DestinationConfiguration: { BucketARN: 7 } },
        "ExtendedS3DestinationConfiguration.BucketARN must be a string",
      ],
      [
        {
          ExtendedS3DestinationConfiguration: {
            ...cdkS3Destination,
            BufferingHints: 60,
          },
        },
        "ExtendedS3DestinationConfiguration.BufferingHints must be an object",
      ],
      [
        {
          ExtendedS3DestinationConfiguration: {
            ...cdkS3Destination,
            BufferingHints: { IntervalInSeconds: "a minute" },
          },
        },
        "BufferingHints.IntervalInSeconds must be a number",
      ],
      [
        {
          Tags: { team: "orders" },
          ExtendedS3DestinationConfiguration: cdkS3Destination,
        },
        "Tags must be a list",
      ],
      [
        {
          Tags: [{ Key: "team" }],
          ExtendedS3DestinationConfiguration: cdkS3Destination,
        },
        "Tags entries must each carry a string Key and Value",
      ],
    ];

    // When each is deployed.
    // Then each is refused saying which property is wrong, rather than
    // reaching CreateDeliveryStream with something it cannot explain.
    for (const [properties, expected] of wrongShapes) {
      // oxlint-disable-next-line no-await-in-loop
      const error = await refusalFrom(properties);
      assertStringIncludes(error.message, expected);
    }
  });

  it("refuses creating a Firehose Resource type it does not simulate", async () => {
    // Given a deployed delivery stream, and the factory that made it.
    const { simAws, stack, resource } = await deployedDeliveryStream();

    // When the factory is asked for a delivery stream's tags.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .firehose()
        .cfnResourceFactory()
        .create("Tags", deployedResourceObject(resource), {
          simAws,
          resources: deployedStackObject(stack).resourceMap,
        });
    });

    // Then it says so, which sim CloudFormation records and steps over.
    assertStringIncludes(
      error.message,
      "Unsupported sim Firehose CloudFormation Resource Tags",
    );
  });

  it("refuses deleting a Firehose Resource type it never creates", async () => {
    // Given a deployed delivery stream, and the factory that made it.
    const { simAws, stack, resource } = await deployedDeliveryStream();

    // When the factory is asked to delete something else.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .firehose()
        .cfnResourceFactory()
        .delete("Tags", deployedResourceObject(resource), {
          simAws,
          resources: deployedStackObject(stack).resourceMap,
        });
    });

    // Then it says so.
    assertStringIncludes(
      error.message,
      "Unsupported sim Firehose CloudFormation Resource Tags deletion",
    );
  });

  it("passes through an error that did not come from simulated Firehose", async () => {
    // Given a creation that fails for a reason of its own.
    const thrown = new TypeError("the template reader broke");

    // When it runs inside the wrapper that renames Firehose refusals.
    const error = await assertThrowsErrorAsync(async () => {
      await simCfnFirehoseResourceCreation(
        "AWS::KinesisFirehose::DeliveryStream",
        "OrderEvents",
        () => Promise.reject(thrown),
      );
    });

    // Then it comes back as it was, since only Firehose's own refusals are
    // reworded to name the Resource.
    assertIdentical(error, thrown);
  });
});

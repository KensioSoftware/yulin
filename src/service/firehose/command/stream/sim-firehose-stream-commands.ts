import type { SimFirehoseDelivery } from "../../delivery/sim-firehose-delivery.js";
import type { SimFirehoseDeliveryStreamStore } from "../../stream/sim-firehose-delivery-stream-store.js";
import type { SimFirehoseDeliveryStreamAccess } from "../sim-firehose-delivery-stream-access.js";
import type { SimFirehoseRequestOptions } from "../sim-firehose-request-options.js";
import { SimFirehoseDeliveryStreamPage } from "./sim-firehose-delivery-stream-page.js";
import { deliveryStreamDescription } from "./sim-firehose-stream-descriptions.js";
import type {
  SimDeleteDeliveryStreamCommand,
  SimDeleteDeliveryStreamCommandOutput,
  SimDescribeDeliveryStreamCommand,
  SimDescribeDeliveryStreamCommandOutput,
  SimListDeliveryStreamsCommand,
  SimListDeliveryStreamsCommandOutput,
} from "./stream.command.js";

/**
 * How many delivery streams ListDeliveryStreams reports when a request asks for
 * no limit.
 */
const defaultListLimit = 10;

interface SimFirehoseStreamCommandsProperties {
  readonly deliveryStreams: SimFirehoseDeliveryStreamStore;
  readonly access: SimFirehoseDeliveryStreamAccess;
  readonly delivery: SimFirehoseDelivery;
}

/**
 * The commands that list, describe and delete delivery streams.
 */
export class SimFirehoseStreamCommands {
  private readonly deliveryStreams: SimFirehoseDeliveryStreamStore;
  private readonly access: SimFirehoseDeliveryStreamAccess;
  private readonly delivery: SimFirehoseDelivery;

  constructor(properties: SimFirehoseStreamCommandsProperties) {
    this.deliveryStreams = properties.deliveryStreams;
    this.access = properties.access;
    this.delivery = properties.delivery;
  }

  /**
   * List the delivery streams in this scope, by name.
   *
   * Real Firehose gives this action no delivery stream level permission, so it
   * authorizes against every delivery stream in the Account and Region and does
   * not filter the list by what the caller can reach.
   *
   * `DeliveryStreamType` filters the list on real Firehose. `DirectPut` is the
   * only type a simulated delivery stream has, so asking for
   * `KinesisStreamAsSource` lists nothing.
   */
  listDeliveryStreams(
    command: SimListDeliveryStreamsCommand,
    options?: SimFirehoseRequestOptions,
  ): SimListDeliveryStreamsCommandOutput {
    this.access.authorizeAny("firehose:ListDeliveryStreams", options);

    const { input } = command;
    const matching = this.deliveryStreams.all.filter(
      (deliveryStream) =>
        input.DeliveryStreamType === undefined ||
        input.DeliveryStreamType === deliveryStream.deliveryStreamType,
    );
    const page = new SimFirehoseDeliveryStreamPage(
      matching,
      input.ExclusiveStartDeliveryStreamName,
      input.Limit ?? defaultListLimit,
    );

    return {
      $metadata: {},
      DeliveryStreamNames: page.items.map((stream) => stream.name),
      HasMoreDeliveryStreams: page.hasMore,
    };
  }

  /**
   * Describe a delivery stream and its destination.
   */
  describeDeliveryStream(
    command: SimDescribeDeliveryStreamCommand,
    options?: SimFirehoseRequestOptions,
  ): SimDescribeDeliveryStreamCommandOutput {
    const deliveryStream = this.access.require(
      "firehose:DescribeDeliveryStream",
      command.input.DeliveryStreamName,
      options,
    );

    return {
      $metadata: {},
      DeliveryStreamDescription: deliveryStreamDescription(deliveryStream),
    };
  }

  /**
   * Delete a delivery stream.
   *
   * Whatever it was holding goes with it. Real Firehose delivers the buffer
   * first, and an Object landing after the delivery stream naming it has gone
   * is nothing a test could expect.
   */
  deleteDeliveryStream(
    command: SimDeleteDeliveryStreamCommand,
    options?: SimFirehoseRequestOptions,
  ): SimDeleteDeliveryStreamCommandOutput {
    const deliveryStream = this.access.require(
      "firehose:DeleteDeliveryStream",
      command.input.DeliveryStreamName,
      options,
    );

    this.delivery.forget(deliveryStream);
    this.deliveryStreams.remove(deliveryStream);

    return { $metadata: {} };
  }
}

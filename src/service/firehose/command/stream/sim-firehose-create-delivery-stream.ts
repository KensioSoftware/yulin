import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import { simFirehoseDestinationOf } from "../../destination/sim-firehose-destination-choice.js";
import {
  SimFirehoseResourceInUseException,
  SimFirehoseUnsimulatedSource,
} from "../../error/sim-firehose.error.js";
import { simFirehoseDeliveryStreamArn } from "../../stream/sim-firehose-delivery-stream-arn.js";
import { requireSimFirehoseDeliveryStreamName } from "../../stream/sim-firehose-delivery-stream-name.js";
import { SimFirehoseDeliveryStream } from "../../stream/sim-firehose-delivery-stream.js";
import type { SimFirehoseDeliveryStreamStore } from "../../stream/sim-firehose-delivery-stream-store.js";
import type { SimFirehoseDeliveryStreamAccess } from "../sim-firehose-delivery-stream-access.js";
import type { SimFirehoseRequestOptions } from "../sim-firehose-request-options.js";
import type {
  SimCreateDeliveryStreamCommand,
  SimCreateDeliveryStreamCommandInput,
  SimCreateDeliveryStreamCommandOutput,
} from "./stream.command.js";

interface SimFirehoseCreateDeliveryStreamProperties {
  readonly deliveryStreams: SimFirehoseDeliveryStreamStore;
  readonly access: SimFirehoseDeliveryStreamAccess;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly background: BackgroundScheduler;
}

/**
 * Creates a delivery stream.
 *
 * The delivery stream is ACTIVE by the time this answers. Real Firehose spends
 * a minute or so in CREATING, and a test that had to wait it out would be
 * waiting on nothing.
 */
export class SimFirehoseCreateDeliveryStream {
  private readonly deliveryStreams: SimFirehoseDeliveryStreamStore;
  private readonly access: SimFirehoseDeliveryStreamAccess;
  private readonly scope: SimAwsAccountRegionScope;
  private readonly background: BackgroundScheduler;

  constructor(properties: SimFirehoseCreateDeliveryStreamProperties) {
    this.deliveryStreams = properties.deliveryStreams;
    this.access = properties.access;
    this.scope = properties.accountRegionScope;
    this.background = properties.background;
  }

  /**
   * Handle a CreateDeliveryStream request.
   *
   * The destination is read before the name is taken, so a request naming a
   * destination this simulation cannot deliver to leaves nothing behind.
   */
  handle(
    command: SimCreateDeliveryStreamCommand,
    options?: SimFirehoseRequestOptions,
  ): SimCreateDeliveryStreamCommandOutput {
    const { input } = command;
    const name = requireSimFirehoseDeliveryStreamName(input.DeliveryStreamName);

    this.access.authorizeName("firehose:CreateDeliveryStream", name, options);
    requireDirectPutSource(input);

    if (this.deliveryStreams.find(name) !== undefined) {
      throw new SimFirehoseResourceInUseException(
        `Firehose already holds a delivery stream named ${name} under this ` +
          `account and region`,
      );
    }

    const arn = simFirehoseDeliveryStreamArn(this.scope, name);

    this.deliveryStreams.add(
      new SimFirehoseDeliveryStream({
        name,
        arn,
        destination: simFirehoseDestinationOf(input),
        createdAt: this.background.now(),
      }),
    );

    return { $metadata: {}, DeliveryStreamARN: arn };
  }
}

/**
 * Refuse a delivery stream that would read from somewhere this simulation
 * cannot read from.
 *
 * An omitted `DeliveryStreamType` is `DirectPut` on real Firehose too.
 */
function requireDirectPutSource(
  input: SimCreateDeliveryStreamCommandInput,
): void {
  const type = input.DeliveryStreamType ?? "DirectPut";

  if (
    type !== "DirectPut" ||
    input.KinesisStreamSourceConfiguration !== undefined
  ) {
    throw new SimFirehoseUnsimulatedSource();
  }
}

import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import { simFirehoseDestinationOf } from "../../destination/sim-firehose-destination-choice.js";
import { SimFirehoseResourceInUseException } from "../../error/sim-firehose.error.js";
import { simFirehoseSourceOf } from "../../source/sim-firehose-source-choice.js";
import type { SimFirehoseSourceReading } from "../../source/read/sim-firehose-source-reading.js";
import { simFirehoseDeliveryStreamArn } from "../../stream/sim-firehose-delivery-stream-arn.js";
import { requireSimFirehoseDeliveryStreamName } from "../../stream/sim-firehose-delivery-stream-name.js";
import { SimFirehoseDeliveryStream } from "../../stream/sim-firehose-delivery-stream.js";
import type { SimFirehoseDeliveryStreamStore } from "../../stream/sim-firehose-delivery-stream-store.js";
import type { SimFirehoseDeliveryStreamAccess } from "../sim-firehose-delivery-stream-access.js";
import type { SimFirehoseRequestOptions } from "../sim-firehose-request-options.js";
import type {
  SimCreateDeliveryStreamCommand,
  SimCreateDeliveryStreamCommandOutput,
} from "./stream.command.js";

interface SimFirehoseCreateDeliveryStreamProperties {
  readonly deliveryStreams: SimFirehoseDeliveryStreamStore;
  readonly access: SimFirehoseDeliveryStreamAccess;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly background: BackgroundScheduler;
  readonly sourceReading: SimFirehoseSourceReading;
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
  private readonly sourceReading: SimFirehoseSourceReading;

  constructor(properties: SimFirehoseCreateDeliveryStreamProperties) {
    this.deliveryStreams = properties.deliveryStreams;
    this.access = properties.access;
    this.scope = properties.accountRegionScope;
    this.background = properties.background;
    this.sourceReading = properties.sourceReading;
  }

  /**
   * Handle a CreateDeliveryStream request.
   *
   * The source and the destination are read before the delivery stream is
   * stored, so a request naming somewhere this simulation cannot read or
   * deliver leaves nothing behind.
   *
   * A Kinesis-sourced delivery stream is reading its stream by the time this
   * answers, so a record put the moment it exists is one it sees. A source it
   * could not open stops the delivery and is recorded on the simulator, since
   * that is what real Firehose does with a Role that cannot read: the delivery
   * stream is created either way.
   */
  async handle(
    command: SimCreateDeliveryStreamCommand,
    options?: SimFirehoseRequestOptions,
  ): Promise<SimCreateDeliveryStreamCommandOutput> {
    const { input } = command;
    const name = requireSimFirehoseDeliveryStreamName(input.DeliveryStreamName);

    this.access.authorizeName("firehose:CreateDeliveryStream", name, options);
    this.requireNameFree(name);

    const createdAt = this.background.now();
    const source = simFirehoseSourceOf(input, this.scope, createdAt);
    const arn = simFirehoseDeliveryStreamArn(this.scope, name);
    const deliveryStream = new SimFirehoseDeliveryStream({
      name,
      arn,
      destination: simFirehoseDestinationOf(input),
      source,
      createdAt,
    });

    this.deliveryStreams.add(deliveryStream);

    await this.sourceReading.start(deliveryStream);

    return { $metadata: {}, DeliveryStreamARN: arn };
  }

  /**
   * Refuse a name this scope already holds a delivery stream under.
   */
  private requireNameFree(name: string): void {
    if (this.deliveryStreams.find(name) !== undefined) {
      throw new SimFirehoseResourceInUseException(
        `Firehose already holds a delivery stream named ${name} under this ` +
          `account and region`,
      );
    }
  }
}

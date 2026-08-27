import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import type { SimSdkCommandRouter } from "../../sdk/router/sim-sdk-command-router.type.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import type { SimIamInterServiceAuthZ } from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import { simIamInRegion } from "../iam/authorize/sim-iam-region-auth-z.js";
import type * as simFirehoseCommands from "./command/sim-firehose-command.types.js";
import { SimFirehoseCommands } from "./command/sim-firehose-commands.js";
import type { SimFirehoseRequestOptions } from "./command/sim-firehose-request-options.js";
import { SimFirehoseCfnResourceFactory } from "./cfn/sim-firehose-cfn-resource-factory.js";
import type { SimFirehoseDeliveryFailure } from "./delivery/sim-firehose-delivery-failures.js";
import { SimFirehoseFailures } from "./failure/sim-firehose-failures.js";
import type { SimFirehoseObjectDestination } from "./delivery/sim-firehose-object-writer.js";
import {
  SimFirehoseNoRecordSource,
  type SimFirehoseRecordSource,
} from "./source/sim-firehose-record-source.js";
import type { SimFirehoseSourceFailure } from "./source/sim-firehose-source-failures.js";
import { SimFirehoseSdkCommandRouter } from "./sdk/sim-firehose-sdk-command-router.js";
import type { SimFirehoseDeliveryStream } from "./stream/sim-firehose-delivery-stream.js";
import { SimFirehoseDeliveryStreamStore } from "./stream/sim-firehose-delivery-stream-store.js";

interface SimFirehoseProperties {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
  readonly s3: SimFirehoseObjectDestination;

  /**
   * The simulated Kinesis a delivery stream reads a source stream from.
   *
   * A SimFirehose built without one delivers whatever is put on it, and refuses
   * to read for a delivery stream created with a Kinesis source.
   */
  readonly kinesis?: SimFirehoseRecordSource;
}

/**
 * Simulated Kinesis Data Firehose. Handles SDK commands. Emulates AWS behaviour
 * and state.
 *
 * Delivery streams are scoped to an Account and Region, as they are on real
 * AWS. A delivery stream name is unique within one of those scopes, and its ARN
 * names the Region.
 *
 * A delivery stream is a destination and a buffer. Records arrive through
 * PutRecord and PutRecordBatch, wait in the buffer until it passes its size or
 * its interval, and leave as one S3 Object written as the delivery stream's
 * `RoleARN`. Advancing simulated time past the interval is what makes a test's
 * records land in the Bucket.
 *
 * A delivery stream can read its records off a simulated Kinesis stream
 * instead, as the source `RoleARN`. It starts at the end of the stream, so
 * records put before it was created stay behind it, and it takes no puts of its
 * own.
 *
 * S3 is the only destination simulated. The rest are refused by name at
 * CreateDeliveryStream.
 */
export class SimFirehose {
  private readonly deliveryStreams = new SimFirehoseDeliveryStreamStore();
  private readonly failures =
    new SimFirehoseFailures<SimFirehoseDeliveryFailure>();
  private readonly sourceFailures =
    new SimFirehoseFailures<SimFirehoseSourceFailure>();
  private readonly commands: SimFirehoseCommands;
  private readonly background: BackgroundScheduler;
  private readonly sdkRouter = new SimFirehoseSdkCommandRouter(this);
  private readonly cfnFactory = new SimFirehoseCfnResourceFactory({
    firehose: this,
  });

  constructor(properties: SimFirehoseProperties) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      background = new BackgroundTasks(),
      kinesis = new SimFirehoseNoRecordSource(),
    } = properties;

    const iam = simIamInRegion(properties.iam, accountRegionScope.regionName);

    this.background = background;
    this.commands = new SimFirehoseCommands({
      deliveryStreams: this.deliveryStreams,
      failures: this.failures,
      sourceFailures: this.sourceFailures,
      s3: properties.s3,
      kinesis,
      iam,
      background,
      accountRegionScope,
    });
  }

  /**
   * Find a delivery stream by name.
   *
   * This is the simulator's own accessor, for tests seeding or inspecting
   * delivery stream state without going through a Command and its
   * authorization.
   */
  findDeliveryStream(name: string): SimFirehoseDeliveryStream | undefined {
    return this.deliveryStreams.find(name);
  }

  /**
   * Get the buffers this Firehose could not write, which is the only place a
   * delivery role missing `s3:PutObject` shows up.
   *
   * Real Firehose has answered the `PutRecord` long before it writes the buffer
   * that record joined, so the caller who put it hears nothing either way.
   */
  getDeliveryFailures(): readonly SimFirehoseDeliveryFailure[] {
    return this.failures.all;
  }

  /**
   * Get the source streams this Firehose stopped reading, which is where a
   * source Role that cannot read its Kinesis stream shows up.
   *
   * A delivery stream reads with no caller in front of it, so a read it was
   * refused reaches a test here rather than through the request that put the
   * record.
   */
  getSourceFailures(): readonly SimFirehoseSourceFailure[] {
    return this.sourceFailures.all;
  }

  /** Handle a CreateDeliveryStream Command from the SDK. */
  async createDeliveryStream(
    command: simFirehoseCommands.SimCreateDeliveryStreamCommand,
    options?: SimFirehoseRequestOptions,
  ): Promise<simFirehoseCommands.SimCreateDeliveryStreamCommandOutput> {
    await this.background.sequence();
    return this.commands.creation.handle(command, options);
  }

  /** Handle a DeleteDeliveryStream Command from the SDK. */
  async deleteDeliveryStream(
    command: simFirehoseCommands.SimDeleteDeliveryStreamCommand,
    options?: SimFirehoseRequestOptions,
  ): Promise<simFirehoseCommands.SimDeleteDeliveryStreamCommandOutput> {
    await this.background.sequence();
    return this.commands.deliveryStreams.deleteDeliveryStream(command, options);
  }

  /** Handle a ListDeliveryStreams Command from the SDK. */
  async listDeliveryStreams(
    command: simFirehoseCommands.SimListDeliveryStreamsCommand,
    options?: SimFirehoseRequestOptions,
  ): Promise<simFirehoseCommands.SimListDeliveryStreamsCommandOutput> {
    await this.background.sequence();
    return this.commands.deliveryStreams.listDeliveryStreams(command, options);
  }

  /** Handle a DescribeDeliveryStream Command from the SDK. */
  async describeDeliveryStream(
    command: simFirehoseCommands.SimDescribeDeliveryStreamCommand,
    options?: SimFirehoseRequestOptions,
  ): Promise<simFirehoseCommands.SimDescribeDeliveryStreamCommandOutput> {
    await this.background.sequence();
    return this.commands.deliveryStreams.describeDeliveryStream(
      command,
      options,
    );
  }

  /** Handle a PutRecord Command from the SDK. */
  async putRecord(
    command: simFirehoseCommands.SimPutRecordCommand,
    options?: SimFirehoseRequestOptions,
  ): Promise<simFirehoseCommands.SimPutRecordCommandOutput> {
    await this.background.sequence();
    return this.commands.puts.putRecord(command, options);
  }

  /** Handle a PutRecordBatch Command from the SDK. */
  async putRecordBatch(
    command: simFirehoseCommands.SimPutRecordBatchCommand,
    options?: SimFirehoseRequestOptions,
  ): Promise<simFirehoseCommands.SimPutRecordBatchCommandOutput> {
    await this.background.sequence();
    return this.commands.puts.putRecordBatch(command, options);
  }

  /**
   * Get this service's SDK Command router for SDK client interception.
   */
  sdkCommandRouter(): SimSdkCommandRouter {
    return this.sdkRouter;
  }

  /**
   * Get this service's CloudFormation Resource factory.
   */
  cfnResourceFactory(): SimFirehoseCfnResourceFactory {
    return this.cfnFactory;
  }
}

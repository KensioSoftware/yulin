import type { SimKinesisStreamStore } from "../../stream/sim-kinesis-stream-store.js";
import { SimKinesisPage } from "../sim-kinesis-page.js";
import type { SimKinesisRequestOptions } from "../sim-kinesis-request-options.js";
import type { SimKinesisStreamAccess } from "../sim-kinesis-stream-access.js";
import {
  streamDescription,
  streamDescriptionSummary,
  streamSummary,
} from "./sim-kinesis-stream-descriptions.js";
import type {
  SimDeleteStreamCommand,
  SimDeleteStreamCommandOutput,
  SimDescribeStreamCommand,
  SimDescribeStreamCommandOutput,
  SimDescribeStreamSummaryCommand,
  SimDescribeStreamSummaryCommandOutput,
  SimListStreamsCommand,
  SimListStreamsCommandOutput,
} from "./stream.command.js";

/**
 * How many streams ListStreams reports when a request asks for no limit.
 */
const defaultStreamLimit = 100;

interface SimKinesisStreamCommandsProperties {
  readonly streams: SimKinesisStreamStore;
  readonly access: SimKinesisStreamAccess;
}

/**
 * The commands that list, describe and delete streams.
 */
export class SimKinesisStreamCommands {
  private readonly streams: SimKinesisStreamStore;
  private readonly access: SimKinesisStreamAccess;

  constructor(properties: SimKinesisStreamCommandsProperties) {
    this.streams = properties.streams;
    this.access = properties.access;
  }

  /**
   * List the streams in this scope, by name.
   *
   * Real Kinesis gives this action no stream-level permission, so it authorizes
   * against every stream in the Account and Region and does not filter the list
   * by what the caller can reach.
   */
  listStreams(
    command: SimListStreamsCommand,
    options?: SimKinesisRequestOptions,
  ): SimListStreamsCommandOutput {
    this.access.authorizeAnyStream("kinesis:ListStreams", options);

    const { input } = command;
    const page = new SimKinesisPage(
      this.streams.all,
      (stream) => stream.name,
      input.NextToken ?? input.ExclusiveStartStreamName,
      input.Limit ?? defaultStreamLimit,
    );

    return {
      $metadata: {},
      StreamNames: page.items.map((stream) => stream.name),
      StreamSummaries: page.items.map((stream) => streamSummary(stream)),
      HasMoreStreams: page.hasMore,
      NextToken: page.hasMore ? page.items.at(-1)?.name : undefined,
    };
  }

  /**
   * Describe a stream and a page of its shards.
   */
  describeStream(
    command: SimDescribeStreamCommand,
    options?: SimKinesisRequestOptions,
  ): SimDescribeStreamCommandOutput {
    const { input } = command;
    const stream = this.access.require(
      "kinesis:DescribeStream",
      input,
      options,
    );

    return {
      $metadata: {},
      StreamDescription: streamDescription(stream, input),
    };
  }

  /**
   * Describe a stream without listing its shards.
   */
  describeStreamSummary(
    command: SimDescribeStreamSummaryCommand,
    options?: SimKinesisRequestOptions,
  ): SimDescribeStreamSummaryCommandOutput {
    const stream = this.access.require(
      "kinesis:DescribeStreamSummary",
      command.input,
      options,
    );

    return {
      $metadata: {},
      StreamDescriptionSummary: streamDescriptionSummary(stream),
    };
  }

  /**
   * Delete a stream, and the records on every one of its shards.
   *
   * The name is freed at once, so a stream can be recreated under the same name
   * straight away. A stream that is not there is refused, as real Kinesis
   * refuses it, unlike SNS where deleting a missing topic succeeds.
   *
   * `EnforceConsumerDeletion` is accepted and needs nothing done with it. It
   * decides what happens to a stream's enhanced fan-out consumers, and no
   * stream here has any.
   */
  deleteStream(
    command: SimDeleteStreamCommand,
    options?: SimKinesisRequestOptions,
  ): SimDeleteStreamCommandOutput {
    const stream = this.access.require(
      "kinesis:DeleteStream",
      command.input,
      options,
    );

    this.streams.remove(stream);

    return { $metadata: {} };
  }
}

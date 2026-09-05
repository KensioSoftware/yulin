import type { SimLambdaStreamDestinationConfiguration } from "./sim-lambda-stream-destination-config.js";
import type { SimLambdaDestinationTargets } from "../destination/sim-lambda-destination-targets.js";
import { SimLambdaNoDestinationTargets } from "../destination/sim-lambda-destination-targets.js";
import { randomUUID } from "node:crypto";

import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimLambdaFunctionArn } from "../function/sim-lambda-function-configuration.js";
import type {
  SimLambdaStreamRetryLimits,
  SimLambdaStreamRetryLimitsConfiguration,
} from "./sim-lambda-stream-retry-limits.js";
import type {
  SimLambdaEventSourceStart,
  SimLambdaEventSourceStartingPosition,
} from "./sim-lambda-event-source-starting-position.js";

/**
 * Event source mapping ARNs address the mapping by its UUID.
 */
export type SimLambdaEventSourceMappingArn =
  `arn:aws:lambda:${string}:${string}:event-source-mapping:${string}`;

/**
 * The response types a mapping can be told the function reports.
 *
 * Only the batch item failure one exists on real Lambda.
 */
export type SimLambdaFunctionResponseType = "ReportBatchItemFailures";

/**
 * The lifecycle states an event source mapping reports.
 *
 * A mapping is Creating until the simulation has caught up with it, then either
 * Enabled or Disabled, as on real Lambda. The states in between, such as
 * Updating and Deleting, belong to operations this simulation does not have.
 */
export type SimLambdaEventSourceMappingState =
  | "Creating"
  | "Enabled"
  | "Disabled";

interface SimLambdaEventSourceMappingProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly eventSourceArn: string;
  readonly functionName: string;
  readonly qualifier?: string | undefined;
  readonly functionArn: SimLambdaFunctionArn;
  readonly batchSize: number;
  readonly start?: SimLambdaEventSourceStart | undefined;
  readonly enabled?: boolean | undefined;
  readonly functionResponseTypes?:
    | readonly SimLambdaFunctionResponseType[]
    | undefined;
  readonly streamRetryLimits?: SimLambdaStreamRetryLimits | undefined;
  readonly destinationConfig?:
    | SimLambdaStreamDestinationConfiguration
    | undefined;
  readonly destinations?: SimLambdaDestinationTargets | undefined;
  readonly createdAt: Date;
}

/**
 * The AWS-shaped configuration of an event source mapping, as the
 * CreateEventSourceMapping, GetEventSourceMapping, ListEventSourceMappings and
 * DeleteEventSourceMapping responses all report it.
 */
export interface SimLambdaEventSourceMappingConfiguration extends Partial<SimLambdaStreamRetryLimitsConfiguration> {
  readonly DestinationConfig?:
    | SimLambdaStreamDestinationConfiguration
    | undefined;
  readonly UUID: string;
  readonly EventSourceMappingArn: SimLambdaEventSourceMappingArn;
  readonly EventSourceArn: string;
  readonly FunctionArn: SimLambdaFunctionArn;
  readonly BatchSize: number;
  readonly StartingPosition?: SimLambdaEventSourceStartingPosition | undefined;
  readonly StartingPositionTimestamp?: Date | undefined;
  readonly MaximumBatchingWindowInSeconds: number;
  readonly FunctionResponseTypes: readonly SimLambdaFunctionResponseType[];
  readonly State: SimLambdaEventSourceMappingState;
  readonly StateTransitionReason: string;
  readonly LastModified: Date;
}

/**
 * One simulated Lambda event source mapping, from an event source to a
 * function.
 *
 * The mapping holds what polling is done with rather than doing the polling: a
 * poller reads the batch size and the response types from here, and the mapping
 * stays the piece of state a Get or List reports. What a batch size may be is
 * the event source's rule, so the mapping is given one rather than defaulting
 * it.
 */
export class SimLambdaEventSourceMapping {
  public readonly destinations: SimLambdaDestinationTargets;
  public readonly uuid: string = randomUUID();
  public readonly eventSourceArn: string;
  public readonly functionName: string;

  /**
   * The version or alias this mapping delivers to, if it was created with one.
   *
   * It is resolved on every poll rather than at creation, so an alias moved to
   * another version moves what the mapping delivers to.
   */
  public readonly qualifier: string | undefined;

  public readonly functionArn: SimLambdaFunctionArn;
  public readonly batchSize: number;
  /**
   * Where this mapping started reading, for a source that has a choice.
   *
   * A queue mapping has none, because a queue only has a front.
   */
  public readonly start: SimLambdaEventSourceStart | undefined;
  public readonly functionResponseTypes: readonly SimLambdaFunctionResponseType[];

  /**
   * When this mapping stops delivering a batch its function keeps failing, for
   * a source that leaves the counting to the mapping.
   *
   * A queue mapping has none, because a message the function never handles is
   * the queue's own problem once the batch comes back.
   */
  public readonly streamRetryLimits: SimLambdaStreamRetryLimits | undefined;

  private readonly destinationConfig:
    | SimLambdaStreamDestinationConfiguration
    | undefined;
  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly enabled: boolean;
  private readonly lastModified: Date;
  #state: SimLambdaEventSourceMappingState = "Creating";

  constructor(properties: SimLambdaEventSourceMappingProperties) {
    this.destinationConfig = properties.destinationConfig;
    this.destinations =
      properties.destinations ?? new SimLambdaNoDestinationTargets();
    this.accountRegionScope = properties.accountRegionScope;
    this.eventSourceArn = properties.eventSourceArn;
    this.functionName = properties.functionName;
    this.qualifier = properties.qualifier;
    this.functionArn = properties.functionArn;
    this.batchSize = properties.batchSize;
    this.start = properties.start;
    // Copied rather than held, so a caller keeping the list it passed in
    // cannot change what this mapping does with a batch afterwards.
    this.functionResponseTypes = [...(properties.functionResponseTypes ?? [])];
    this.streamRetryLimits = properties.streamRetryLimits;
    this.enabled = properties.enabled ?? true;
    this.lastModified = properties.createdAt;
  }

  /** The configured failure queue or topic ARN. */
  get failureDestinationArn(): string | undefined {
    return this.destinationConfig?.OnFailure?.Destination;
  }

  /** The ARN naming this mapping. */
  get arn(): SimLambdaEventSourceMappingArn {
    const { regionName, accountId } = this.accountRegionScope;

    return `arn:aws:lambda:${regionName}:${accountId}:event-source-mapping:${this.uuid}`;
  }

  /**
   * The state this mapping is in.
   */
  get state(): SimLambdaEventSourceMappingState {
    return this.#state;
  }

  /**
   * Whether this mapping is polling its event source.
   *
   * A mapping still being created is not, as on real Lambda, where a mapping
   * starts delivering once it reaches the Enabled state.
   */
  get isPolling(): boolean {
    return this.#state === "Enabled";
  }

  /**
   * Whether the function reports its own batch item failures.
   */
  get reportsBatchItemFailures(): boolean {
    return this.functionResponseTypes.includes("ReportBatchItemFailures");
  }

  /**
   * Finish creating this mapping, as real Lambda does asynchronously.
   */
  activate(): Promise<void> {
    this.#state = this.enabled ? "Enabled" : "Disabled";

    return Promise.resolve();
  }

  /**
   * The AWS-like configuration for this mapping.
   */
  configuration(): SimLambdaEventSourceMappingConfiguration {
    return {
      DestinationConfig: structuredClone(this.destinationConfig),
      UUID: this.uuid,
      EventSourceMappingArn: this.arn,
      EventSourceArn: this.eventSourceArn,
      FunctionArn: this.functionArn,
      BatchSize: this.batchSize,
      StartingPosition: this.start?.position,
      StartingPositionTimestamp: this.start?.timestamp,
      // Partial batches are delivered as soon as anything is available, so the
      // batching window is always zero. Anything else is refused at creation.
      MaximumBatchingWindowInSeconds: 0,
      // Real Lambda reports both failed-batch limits for a stream mapping and
      // neither for a queue one, so a mapping with no limits to keep leaves
      // them out rather than reporting a limit it does not have.
      ...this.streamRetryLimits?.configuration(),
      FunctionResponseTypes: this.functionResponseTypes,
      State: this.#state,
      StateTransitionReason: "USER_INITIATED",
      LastModified: this.lastModified,
    };
  }
}

import type { SimLambdaDestinationTargets } from "../../destination/sim-lambda-destination-targets.js";
import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimSqsPollQueues } from "../../../sqs/poll/sim-sqs-poll-queues.js";
import type { SimLambdaKinesisStreams } from "../../event-source/stream/kinesis/sim-lambda-kinesis-streams.js";
import type { SimLambdaEventSourceStreams } from "../../event-source/stream/sim-lambda-event-source-streams.js";
import type { SimLambdaEventSourceMapping } from "../../event-source/sim-lambda-event-source-mapping.js";
import { SimLambdaEventSourceMappingStore } from "../../event-source/sim-lambda-event-source-mapping-store.js";
import type { SimLambdaEventSourcePollers } from "../../event-source/sim-lambda-event-source-pollers.js";
import { simLambdaFunctionNameOf } from "../../function/sim-lambda-function-name.js";
import type { SimLambdaFunctionLookup } from "../../function/url/sim-lambda-function-lookup.js";
import { CreateEventSourceMappingCommandHandler } from "./create-event-source-mapping.handler.js";
import {
  anyFunctionName,
  SimLambdaEventSourceMappingAccess,
} from "./event-source-mapping-access.js";
import type {
  SimCreateEventSourceMappingCommand,
  SimCreateEventSourceMappingCommandOutput,
  SimDeleteEventSourceMappingCommand,
  SimDeleteEventSourceMappingCommandOutput,
  SimGetEventSourceMappingCommand,
  SimGetEventSourceMappingCommandOutput,
  SimListEventSourceMappingsCommand,
  SimListEventSourceMappingsCommandOutput,
} from "./event-source-mapping.command.js";

interface SimLambdaEventSourceMappingCommandsProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly pollers: SimLambdaEventSourcePollers;
  readonly queues: SimSqsPollQueues;
  readonly streams: SimLambdaEventSourceStreams;
  readonly kinesisStreams: SimLambdaKinesisStreams;
  readonly functions: SimLambdaFunctionLookup;
  readonly iam: SimIamInterServiceAuthZ;
  readonly destinations?: SimLambdaDestinationTargets;
  readonly background: BackgroundScheduler;
}

interface SimLambdaEventSourceMappingCommandOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The event source mapping commands of one simulated Lambda scope.
 *
 * All four act on the same store and authorize against the function the mapping
 * delivers to, so they share one class rather than repeating that wiring.
 * Creating a mapping is the only one with anything else to do, so it is the
 * only one with a handler of its own.
 */
export class SimLambdaEventSourceMappingCommands {
  private readonly mappings = new SimLambdaEventSourceMappingStore();
  private readonly access: SimLambdaEventSourceMappingAccess;
  private readonly properties: SimLambdaEventSourceMappingCommandsProperties;

  constructor(properties: SimLambdaEventSourceMappingCommandsProperties) {
    this.properties = properties;
    this.access = new SimLambdaEventSourceMappingAccess({
      mappings: this.mappings,
      functions: properties.functions,
      iam: properties.iam,
    });
  }

  /**
   * Create an event source mapping from an event source to a function.
   */
  async create(
    command: SimCreateEventSourceMappingCommand,
    options?: SimLambdaEventSourceMappingCommandOptions,
  ): Promise<SimCreateEventSourceMappingCommandOutput> {
    return await new CreateEventSourceMappingCommandHandler({
      ...this.properties,
      mappings: this.mappings,
    }).handle(command, options);
  }

  /**
   * Read one event source mapping.
   */
  async get(
    command: SimGetEventSourceMappingCommand,
    options?: SimLambdaEventSourceMappingCommandOptions,
  ): Promise<SimGetEventSourceMappingCommandOutput> {
    await this.properties.background.sequence();

    const mapping = this.access.require(
      "lambda:GetEventSourceMapping",
      command.input.UUID,
      options?.caller,
    );

    return { $metadata: {}, ...mapping.configuration() };
  }

  /**
   * List the event source mappings, narrowed by queue or function.
   *
   * A listing naming no function authorizes against every function in the
   * Account and Region, because that is what it can report on. A policy naming
   * one function ARN therefore allows only the listing that names it.
   */
  async list(
    command: SimListEventSourceMappingsCommand,
    options?: SimLambdaEventSourceMappingCommandOptions,
  ): Promise<SimListEventSourceMappingsCommandOutput> {
    await this.properties.background.sequence();

    const functionName = listedFunctionName(command.input.FunctionName);

    this.access.authorizeFunction(
      "lambda:ListEventSourceMappings",
      functionName ?? anyFunctionName,
      options?.caller,
    );

    const matching = this.mappings.matching({
      eventSourceArn: command.input.EventSourceArn,
      functionName,
    });

    return {
      $metadata: {},
      EventSourceMappings: matching.map((mapping) => mapping.configuration()),
    };
  }

  /**
   * Delete an event source mapping, which stops it polling.
   */
  async delete(
    command: SimDeleteEventSourceMappingCommand,
    options?: SimLambdaEventSourceMappingCommandOptions,
  ): Promise<SimDeleteEventSourceMappingCommandOutput> {
    await this.properties.background.sequence();

    const mapping = this.access.require(
      "lambda:DeleteEventSourceMapping",
      command.input.UUID,
      options?.caller,
    );

    this.properties.pollers.stop(mapping);
    this.mappings.remove(mapping);

    return { $metadata: {}, ...mapping.configuration() };
  }

  /**
   * Find a mapping by UUID, for tests inspecting mapping state directly.
   */
  find(uuid: string): SimLambdaEventSourceMapping | undefined {
    return this.mappings.find(uuid);
  }
}

/**
 * The function name a listing is narrowed by, which is any of them when the
 * request names none.
 */
function listedFunctionName(requested: string | undefined): string | undefined {
  if (requested === undefined) {
    return undefined;
  }

  return simLambdaFunctionNameOf(requested);
}

import type { CommandHandler } from "../../../../command/command-handler.js";
import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimSqsPollQueues } from "../../../sqs/poll/sim-sqs-poll-queues.js";
import type { SimLambdaEventSourceArn } from "../../event-source/sim-lambda-event-source-arn.js";
import { SimLambdaEventSourceMapping } from "../../event-source/sim-lambda-event-source-mapping.js";
import type { SimLambdaEventSourceMappingStore } from "../../event-source/sim-lambda-event-source-mapping-store.js";
import type { SimLambdaEventSourcePollers } from "../../event-source/sim-lambda-event-source-pollers.js";
import { SimLambdaEventSourceReachable } from "../../event-source/sim-lambda-event-source-reachable.js";
import { SimLambdaEventSourceRolePermissions } from "../../event-source/sim-lambda-event-source-role-permissions.js";
import type { SimLambdaEventSourceStreams } from "../../event-source/stream/sim-lambda-event-source-streams.js";
import type { SimLambdaFunction } from "../../function/sim-lambda-function.js";
import type { SimLambdaFunctionLookup } from "../../function/url/sim-lambda-function-lookup.js";
import type { SimLambdaFunctionTarget } from "../../function/version/sim-lambda-function-target.js";
import { FunctionUrlAuthorizer } from "../function-url/function-url-authorizer.js";
import { SimLambdaEventSourceMappingInput } from "./create-event-source-mapping-input.js";
import type {
  SimCreateEventSourceMappingCommand,
  SimCreateEventSourceMappingCommandOutput,
} from "./event-source-mapping.command.js";

interface CreateEventSourceMappingCommandHandlerProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly mappings: SimLambdaEventSourceMappingStore;
  readonly pollers: SimLambdaEventSourcePollers;
  readonly queues: SimSqsPollQueues;
  readonly streams: SimLambdaEventSourceStreams;
  readonly functions: SimLambdaFunctionLookup;
  readonly iam: SimIamInterServiceAuthZ;
  readonly background: BackgroundScheduler;
}

interface CreateEventSourceMappingCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * Simulated Lambda CreateEventSourceMappingCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/CreateEventSourceMappingCommand/
 *
 * Two things are checked here that only look like polling concerns: that the
 * queue exists, and that the function's execution role may poll it. Real Lambda
 * checks both when the mapping is created, because a mapping that cannot poll
 * looks like a working subscription and delivers nothing.
 */
export class CreateEventSourceMappingCommandHandler implements CommandHandler<
  SimCreateEventSourceMappingCommand,
  SimCreateEventSourceMappingCommandOutput
> {
  private readonly properties: CreateEventSourceMappingCommandHandlerProperties;
  private readonly authorizer: FunctionUrlAuthorizer;
  private readonly rolePermissions: SimLambdaEventSourceRolePermissions;
  private readonly reachable: SimLambdaEventSourceReachable;

  constructor(properties: CreateEventSourceMappingCommandHandlerProperties) {
    this.properties = properties;
    this.authorizer = new FunctionUrlAuthorizer({
      iam: properties.iam,
      action: "lambda:CreateEventSourceMapping",
    });
    this.rolePermissions = new SimLambdaEventSourceRolePermissions({
      iam: properties.iam,
    });
    this.reachable = new SimLambdaEventSourceReachable({
      queues: properties.queues,
      streams: properties.streams,
    });
  }

  /**
   * Create an event source mapping, and start it polling.
   */
  async handle(
    command: SimCreateEventSourceMappingCommand,
    options?: CreateEventSourceMappingCommandHandlerOptions,
  ): Promise<SimCreateEventSourceMappingCommandOutput> {
    const input = SimLambdaEventSourceMappingInput.of(
      command.input,
      this.properties.accountRegionScope,
    );

    // Allow for potential non-deterministic sequencing of async events.
    await this.properties.background.sequence();

    const { functions } = this.properties;

    this.authorizer.authorize(
      functions.functionArn(input.functionName, input.qualifier),
      options?.caller,
    );

    // The version a qualifier names has to be there when the mapping is made,
    // the same way the function does, so a mapping onto an alias nothing
    // published is refused rather than polling into nothing.
    const target = functions.requireTarget(input.functionName, input.qualifier);

    await this.assertPollable(target.simFunction, input.eventSourceArn);

    return {
      $metadata: {},
      ...this.created(input, target).configuration(),
    };
  }

  /**
   * Refuse a mapping whose event source cannot be polled as the execution
   * role.
   *
   * The role's permission is checked before the source is read, so a role with
   * no access is told what it is missing rather than being told the source does
   * not exist.
   */
  private async assertPollable(
    simFunction: SimLambdaFunction,
    eventSourceArn: SimLambdaEventSourceArn,
  ): Promise<void> {
    this.rolePermissions.assertMayPoll(simFunction.roleArn, eventSourceArn);

    // Reading the source as the role is how the mapping finds out it is there
    // at all, exactly as the poller will.
    await this.reachable.assertReachable(simFunction.roleArn, eventSourceArn);
  }

  private created(
    input: SimLambdaEventSourceMappingInput,
    target: SimLambdaFunctionTarget,
  ): SimLambdaEventSourceMapping {
    const mapping = new SimLambdaEventSourceMapping({
      accountRegionScope: this.properties.accountRegionScope,
      eventSourceArn: input.eventSourceArn.value,
      functionName: input.functionName,
      qualifier: input.qualifier,
      // The ARN the mapping reports is the resource it was pointed at, so a
      // mapping onto an alias reports the alias rather than the version behind
      // it, as real Lambda does.
      functionArn: target.resource.arn,
      batchSize: input.batchSize,
      startingPosition: input.startingPosition,
      enabled: input.enabled,
      functionResponseTypes: input.functionResponseTypes,
      createdAt: this.properties.background.now(),
    });

    this.properties.mappings.add(mapping);
    this.properties.pollers.start(mapping, input.eventSourceArn);

    return mapping;
  }
}

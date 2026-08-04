import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import {
  type SimLambdaEventSourceArn,
  simLambdaEventSourceArnOf,
} from "../../event-source/sim-lambda-event-source-arn.js";
import type { SimLambdaFunctionResponseType } from "../../event-source/sim-lambda-event-source-mapping.js";
import type { SimLambdaEventSourceStartingPosition } from "../../event-source/sim-lambda-event-source-starting-position.js";
import { SimLambdaInvalidParameterValueException } from "../../error/sim-lambda.error.js";
import { simLambdaFunctionNameOf } from "../../function/sim-lambda-function-name.js";
import {
  functionResponseTypesIn,
  requiredString,
} from "./create-event-source-mapping-values.js";
import {
  refuseUnsimulatedInput,
  refuseUnsupportedEventSourceInput,
} from "./create-event-source-mapping-refusals.js";
import type { SimCreateEventSourceMappingCommandInput } from "./event-source-mapping.command.js";

interface SimLambdaEventSourceMappingInputProperties {
  readonly eventSourceArn: SimLambdaEventSourceArn;
  readonly functionName: string;
  readonly batchSize: number;
  readonly startingPosition: SimLambdaEventSourceStartingPosition | undefined;
  readonly enabled: boolean;
  readonly functionResponseTypes: readonly SimLambdaFunctionResponseType[];
}

/**
 * One checked CreateEventSourceMapping request.
 *
 * Everything the request is refused for is decided here, before a mapping
 * exists: a mapping that cannot poll the way it was asked to would look like a
 * working subscription and deliver nothing.
 *
 * The event source ARN is read first, because what a mapping may ask for
 * depends on the kind of source it names.
 */
export class SimLambdaEventSourceMappingInput {
  public readonly eventSourceArn: SimLambdaEventSourceArn;
  public readonly functionName: string;
  public readonly batchSize: number;
  public readonly startingPosition:
    SimLambdaEventSourceStartingPosition | undefined;
  public readonly enabled: boolean;
  public readonly functionResponseTypes: readonly SimLambdaFunctionResponseType[];

  private constructor(properties: SimLambdaEventSourceMappingInputProperties) {
    this.eventSourceArn = properties.eventSourceArn;
    this.functionName = properties.functionName;
    this.batchSize = properties.batchSize;
    this.startingPosition = properties.startingPosition;
    this.enabled = properties.enabled;
    this.functionResponseTypes = properties.functionResponseTypes;
  }

  /**
   * Read a CreateEventSourceMapping request, refusing what this simulation
   * cannot deliver as asked.
   */
  static of(
    input: SimCreateEventSourceMappingCommandInput,
    scope: SimAwsAccountRegionScope,
  ): SimLambdaEventSourceMappingInput {
    const eventSourceArn = eventSourceArnIn(input, scope);

    refuseUnsupportedEventSourceInput(input);
    refuseUnsimulatedInput(input);

    return new this({
      eventSourceArn,
      functionName: simLambdaFunctionNameOf(
        requiredString(input.FunctionName, "functionName"),
      ),
      batchSize: eventSourceArn.batchRules.sizeIn(input.BatchSize),
      startingPosition: eventSourceArn.startingPositionRules.positionIn({
        startingPosition: input.StartingPosition,
        startingPositionTimestamp: input.StartingPositionTimestamp,
      }),
      enabled: input.Enabled ?? true,
      functionResponseTypes: functionResponseTypesIn(input, eventSourceArn),
    });
  }
}

/**
 * The event source an ARN names, refusing one this simulated Lambda cannot
 * poll.
 */
function eventSourceArnIn(
  input: SimCreateEventSourceMappingCommandInput,
  scope: SimAwsAccountRegionScope,
): SimLambdaEventSourceArn {
  const eventSourceArn = simLambdaEventSourceArnOf(
    requiredString(input.EventSourceArn, "eventSourceArn"),
  );

  if (!eventSourceArn.isIn(scope.accountId, scope.regionName)) {
    throw new SimLambdaInvalidParameterValueException(
      `EventSourceArn ${eventSourceArn.value} names Account ` +
        `${eventSourceArn.accountId} in ${eventSourceArn.regionName}, and a ` +
        `function in Account ${scope.accountId} in ${scope.regionName} can ` +
        "only be mapped to an event source in its own Account and Region",
    );
  }

  return eventSourceArn;
}

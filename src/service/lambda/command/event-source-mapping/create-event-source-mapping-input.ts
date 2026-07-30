import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import { SimLambdaSqsEventSourceArn } from "../../event-source/queue/sim-lambda-sqs-event-source-arn.js";
import type { SimLambdaFunctionResponseType } from "../../event-source/sim-lambda-event-source-mapping.js";
import { SimLambdaInvalidParameterValueException } from "../../error/sim-lambda.error.js";
import { simLambdaFunctionNameOf } from "../../function/sim-lambda-function-name.js";
import {
  batchSizeIn,
  functionResponseTypesIn,
  requiredString,
} from "./create-event-source-mapping-values.js";
import { refuseUnsimulatedInput } from "./create-event-source-mapping-refusals.js";
import type { SimCreateEventSourceMappingCommandInput } from "./event-source-mapping.command.js";

interface SimLambdaEventSourceMappingInputProperties {
  readonly eventSourceArn: SimLambdaSqsEventSourceArn;
  readonly functionName: string;
  readonly batchSize: number;
  readonly enabled: boolean;
  readonly functionResponseTypes: readonly SimLambdaFunctionResponseType[];
}

/**
 * One checked CreateEventSourceMapping request.
 *
 * Everything the request is refused for is decided here, before a mapping
 * exists: a mapping that cannot poll the way it was asked to would look like a
 * working subscription and deliver nothing.
 */
export class SimLambdaEventSourceMappingInput {
  public readonly eventSourceArn: SimLambdaSqsEventSourceArn;
  public readonly functionName: string;
  public readonly batchSize: number;
  public readonly enabled: boolean;
  public readonly functionResponseTypes: readonly SimLambdaFunctionResponseType[];

  private constructor(properties: SimLambdaEventSourceMappingInputProperties) {
    this.eventSourceArn = properties.eventSourceArn;
    this.functionName = properties.functionName;
    this.batchSize = properties.batchSize;
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
    refuseUnsimulatedInput(input);

    return new this({
      eventSourceArn: eventSourceArnIn(input, scope),
      functionName: simLambdaFunctionNameOf(
        requiredString(input.FunctionName, "functionName"),
      ),
      batchSize: batchSizeIn(input),
      enabled: input.Enabled ?? true,
      functionResponseTypes: functionResponseTypesIn(input),
    });
  }
}

/**
 * The queue an event source ARN names, refusing one this simulated Lambda
 * cannot poll.
 */
function eventSourceArnIn(
  input: SimCreateEventSourceMappingCommandInput,
  scope: SimAwsAccountRegionScope,
): SimLambdaSqsEventSourceArn {
  const eventSourceArn = SimLambdaSqsEventSourceArn.of(
    requiredString(input.EventSourceArn, "eventSourceArn"),
  );

  if (!eventSourceArn.isIn(scope.accountId, scope.regionName)) {
    throw new SimLambdaInvalidParameterValueException(
      `EventSourceArn ${eventSourceArn.value} names Account ` +
        `${eventSourceArn.accountId} in ${eventSourceArn.regionName}, and a ` +
        `function in Account ${scope.accountId} in ${scope.regionName} can ` +
        "only be mapped to a queue in its own Account and Region",
    );
  }

  return eventSourceArn;
}

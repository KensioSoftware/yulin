import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimLambdaEventSourceMapping } from "../../event-source/sim-lambda-event-source-mapping.js";
import type { SimLambdaEventSourceMappingStore } from "../../event-source/sim-lambda-event-source-mapping-store.js";
import { SimLambdaValidationException } from "../../error/sim-lambda.error.js";
import type { SimLambdaFunctionLookup } from "../../function/url/sim-lambda-function-lookup.js";
import { FunctionUrlAuthorizer } from "../function-url/function-url-authorizer.js";

/**
 * The function name a request naming none authorizes against: every function
 * in the Account and Region.
 */
export const anyFunctionName = "*";

interface SimLambdaEventSourceMappingAccessProperties {
  readonly mappings: SimLambdaEventSourceMappingStore;
  readonly functions: SimLambdaFunctionLookup;
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * How a request reaches the event source mapping it names.
 *
 * Real Lambda gives these actions the function the mapping delivers to as
 * their resource, so that is what they authorize against. The mapping is
 * resolved first, because its UUID is the only thing a request carries and the
 * function it belongs to is not knowable without it.
 */
export class SimLambdaEventSourceMappingAccess {
  private readonly mappings: SimLambdaEventSourceMappingStore;
  private readonly functions: SimLambdaFunctionLookup;
  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: SimLambdaEventSourceMappingAccessProperties) {
    this.mappings = properties.mappings;
    this.functions = properties.functions;
    this.iam = properties.iam;
  }

  /**
   * Resolve the mapping a request names by UUID, authorizing the action on the
   * function it delivers to.
   */
  require(
    action: string,
    uuid: string | undefined,
    caller?: SimAwsCaller,
  ): SimLambdaEventSourceMapping {
    const mapping = this.mappings.require(requiredUuid(uuid));

    this.authorize(action, mapping.functionArn, caller);

    return mapping;
  }

  /**
   * Ensure the caller may perform an action on a function by name.
   */
  authorizeFunction(
    action: string,
    functionName: string,
    caller?: SimAwsCaller,
  ): void {
    this.authorize(action, this.functions.functionArn(functionName), caller);
  }

  private authorize(
    action: string,
    functionArn: string,
    caller: SimAwsCaller | undefined,
  ): void {
    new FunctionUrlAuthorizer({ iam: this.iam, action }).authorize(
      functionArn,
      caller,
    );
  }
}

function requiredUuid(uuid: string | undefined): string {
  if (uuid === undefined || uuid === "") {
    throw new SimLambdaValidationException(
      "1 validation error detected: Value null at 'uuid' failed to satisfy " +
        "constraint: Member must not be null",
    );
  }

  return uuid;
}

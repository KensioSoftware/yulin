import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { simLambdaQualifiedFunctionOf } from "../../function/sim-lambda-function-reference.js";
import type { SimLambdaFunctionLookup } from "../../function/url/sim-lambda-function-lookup.js";
import { EventInvokeConfigAuthorizer } from "./event-invoke-config-authorizer.js";

export interface EventInvokeConfigCommandProperties {
  readonly functions: SimLambdaFunctionLookup;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

export interface EventInvokeConfigCommandOptions {
  readonly caller?: SimAwsCaller;
}

interface EventInvokeConfigRequestProperties extends EventInvokeConfigCommandProperties {
  readonly action: string;
}

/**
 * What every event invoke config command resolved from its request.
 */
export interface ResolvedEventInvokeConfigRequest {
  readonly functionName: string;
  readonly qualifier: string | undefined;
  readonly functionArn: string;
}

/**
 * The opening of every event invoke config command.
 *
 * All five name a function the same way, authorize the same way and fail the
 * same way when the function is missing. Only the action name differs, so the
 * five handlers share this rather than repeating it.
 */
export class EventInvokeConfigRequest {
  private readonly functions: SimLambdaFunctionLookup;
  private readonly background: BackgroundScheduler;
  private readonly authorizer: EventInvokeConfigAuthorizer;

  constructor(properties: EventInvokeConfigRequestProperties) {
    const {
      functions,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;
    this.functions = functions;
    this.background = background;
    this.authorizer = new EventInvokeConfigAuthorizer({
      iam,
      action: properties.action,
    });
  }

  /**
   * Name the function this request is about, and check the caller may reach
   * it.
   *
   * The qualifier comes from the request's own `Qualifier` or from the
   * function name it was addressed to, as it does on Invoke.
   */
  async resolve(
    input: {
      FunctionName?: string | undefined;
      Qualifier?: string | undefined;
    },
    commandName: string,
    options?: EventInvokeConfigCommandOptions,
  ): Promise<ResolvedEventInvokeConfigRequest> {
    assertDefined(
      input.FunctionName,
      `${commandName}.input.FunctionName required`,
    );

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const { functionName, qualifier } = simLambdaQualifiedFunctionOf(
      input.FunctionName,
      input.Qualifier,
    );
    const functionArn = this.functions.functionArn(functionName, qualifier);
    this.authorizer.authorize(functionArn, options?.caller);
    this.functions.require(functionName);

    return { functionName, qualifier, functionArn };
  }
}

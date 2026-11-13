import type { SimIamAuthorizationInput } from "../../../iam/authorize/context/sim-iam-auth-z-input.js";
import type {
  SimIamAuthorizationDecision,
  SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { simLambdaFunctionNameOf } from "../sim-lambda-function-name.js";
import type { SimLambdaFunctionLookup } from "../url/sim-lambda-function-lookup.js";

/**
 * IAM authorization that gives a policy the tags of the function a request
 * acts on, as `aws:ResourceTag/<key>`.
 *
 * Every simulated Lambda command authorizes against a function ARN, so the
 * tags are read here once, from the function the ARN names, and the commands
 * say nothing about them. A version or alias ARN reads the function's tags,
 * since a function's tags are shared with all of them. A resource that is not
 * one of this scope's functions, such as `*` or a queue ARN, carries none.
 *
 * A value the request already supplies under the same key wins, the way
 * `simIamInRegion` leaves a Region the request named alone.
 */
export class SimLambdaTagConditionIam implements SimIamInterServiceAuthZ {
  readonly #iam: SimIamInterServiceAuthZ;
  readonly #functions: SimLambdaFunctionLookup;

  constructor(
    iam: SimIamInterServiceAuthZ,
    functions: SimLambdaFunctionLookup,
  ) {
    this.#iam = iam;
    this.#functions = functions;
  }

  /**
   * Evaluate an authorization request with the tags of the function it names.
   */
  authorize(input: SimIamAuthorizationInput): SimIamAuthorizationDecision {
    return this.#iam.authorize({
      ...input,
      conditionContext: {
        ...this.resourceTagConditions(input.resource),
        ...input.conditionContext,
      },
    });
  }

  private resourceTagConditions(resource: string): Record<string, string> {
    const name = simLambdaFunctionNameOf(resource);
    const arn = this.#functions.functionArn(name);
    const named = resource === arn || resource.startsWith(`${arn}:`);
    const tags = named ? this.#functions.find(name)?.tags.record() : undefined;

    return Object.fromEntries(
      Object.entries(tags ?? {}).map(([key, value]) => [
        `aws:ResourceTag/${key}`,
        value,
      ]),
    );
  }
}

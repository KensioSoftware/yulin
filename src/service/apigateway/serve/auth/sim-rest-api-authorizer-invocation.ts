import {
  type SimRestApiAuthorization,
  SimRestApiRefused,
} from "../../api/authorizer/sim-rest-api-authorization.js";
import type { SimRestApiAuthorizer } from "../../api/authorizer/sim-rest-api-authorizer.js";
import type { SimRestApiLambdaUri } from "../../api/method/sim-rest-api-lambda-uri.js";
import type { SimRestApiFunctionTarget } from "../sim-rest-api-function-target.js";
import { simRestApiTokenAuthorizerEvent } from "./sim-rest-api-authorizer-event.js";
import { SimRestApiAuthorizerResponse } from "./sim-rest-api-authorizer-response.js";
import { simRestApiMayNotInvokeAuthorizer } from "./sim-rest-api-invoke-authorizer.js";
import type { SimRestApiMethodAuthorizeInput } from "./sim-rest-api-method-authorize-input.js";

/**
 * Finds the function an authorizer names, which the serving router does.
 */
export interface SimRestApiAuthorizerFunctions {
  functionFor(
    lambdaUri: SimRestApiLambdaUri,
  ): SimRestApiFunctionTarget | undefined;
}

interface SimRestApiAuthorizerInvocationProperties {
  readonly functions: SimRestApiAuthorizerFunctions;
}

/**
 * Invokes a `TOKEN` authorizer's function and reads what it answered.
 *
 * The API's permission to invoke that function is asked first, under an ARN
 * naming the authorizer rather than any method. A function that is not there,
 * one the API may not invoke, and one that failed are the same 500, as they
 * are on real AWS. None of them is anything the caller could act on.
 */
export class SimRestApiAuthorizerInvocation {
  private readonly functions: SimRestApiAuthorizerFunctions;

  constructor(properties: SimRestApiAuthorizerInvocationProperties) {
    this.functions = properties.functions;
  }

  /**
   * Ask the authorizer's function about one request.
   */
  async invoke(
    input: SimRestApiMethodAuthorizeInput,
    authorizer: SimRestApiAuthorizer,
    authorizationToken: string,
    methodArn: string,
  ): Promise<SimRestApiAuthorization> {
    const target = this.functions.functionFor(authorizer.lambdaUri);

    if (
      target === undefined ||
      simRestApiMayNotInvokeAuthorizer(input.restApi, authorizer, target)
    ) {
      return SimRestApiRefused.error();
    }

    try {
      const result = await target.simFunction.invoke(
        simRestApiTokenAuthorizerEvent(authorizationToken, methodArn),
      );

      return new SimRestApiAuthorizerResponse(methodArn).read(result);
    } catch {
      // An authorizer that failed tells the caller nothing, the way an
      // integration that failed does not.
      return SimRestApiRefused.error();
    }
  }
}

import {
  SimRestApiAdmitted,
  type SimRestApiAuthorization,
  SimRestApiRefused,
} from "../../api/authorizer/sim-rest-api-authorization.js";
import { SimRestApiExecuteApiArn } from "../../api/sim-rest-api-execute-api-arn.js";
import {
  type SimRestApiAuthorizerFunctions,
  SimRestApiAuthorizerInvocation,
} from "./sim-rest-api-authorizer-invocation.js";
import { SimRestApiIamMethodAuthorizer } from "./sim-rest-api-iam-method-authorizer.js";
import type { SimRestApiMethodAuthorizeInput } from "./sim-rest-api-method-authorize-input.js";

interface SimRestApiMethodAuthorizerProperties {
  /**
   * Where an authorizer's function is found, which is the same router that
   * finds an integration's.
   */
  readonly functions: SimRestApiAuthorizerFunctions;
}

/**
 * Decides whether one request may have the method that matched it.
 *
 * This is the client's side of the question, and it runs before the API asks
 * whether it may invoke the integration. A request presenting no credentials
 * is refused whether or not the integration behind the method would have
 * worked.
 *
 * Which kind of authorization the method asks for is settled here, and each
 * kind decides on its own terms. The steps for a `CUSTOM` method are the ones
 * real API Gateway takes:
 *
 * 1. the request has to carry something at the authorizer's identity source,
 *    or it is refused with a 401 and the function is never invoked;
 * 2. otherwise the function is asked, and the policy it answers with is
 *    evaluated against the ARN of the request being made.
 */
export class SimRestApiMethodAuthorizer {
  private readonly invocation: SimRestApiAuthorizerInvocation;
  private readonly iamAuthorizer = new SimRestApiIamMethodAuthorizer();

  constructor(properties: SimRestApiMethodAuthorizerProperties) {
    this.invocation = new SimRestApiAuthorizerInvocation({
      functions: properties.functions,
    });
  }

  /**
   * Authorize one request against the method that matched it.
   */
  async authorize(
    input: SimRestApiMethodAuthorizeInput,
  ): Promise<SimRestApiAuthorization> {
    switch (input.match.method.authorizationType) {
      case "NONE": {
        // Nobody was authorized, so there is no caller to describe, which is
        // what leaves requestContext.authorizer out of the event entirely.
        return new SimRestApiAdmitted();
      }
      case "AWS_IAM": {
        return this.iamAuthorizer.authorize(input);
      }
      case "CUSTOM": {
        return await this.custom(input);
      }
    }
  }

  /**
   * Authorize one request against the `CUSTOM` method that matched it.
   */
  private async custom(
    input: SimRestApiMethodAuthorizeInput,
  ): Promise<SimRestApiAuthorization> {
    const { restApi, match, request } = input;
    const authorizer = restApi.authorizers.find(
      match.method.authorizerId ?? "",
    );

    // A CUSTOM method always names an authorizer, and that authorizer can
    // still be deleted out from under it, so the two come to the same thing
    // here: with nothing to ask, the method stays closed.
    if (authorizer === undefined) {
      return SimRestApiRefused.unauthorized();
    }

    const authorizationToken = authorizer.identitySource.value(request);

    if (authorizationToken === undefined) {
      return SimRestApiRefused.unauthorized();
    }

    return await this.invocation.invoke(
      input,
      authorizer,
      authorizationToken,
      SimRestApiExecuteApiArn.forRequest(
        restApi,
        match,
        request.method,
      ).toString(),
    );
  }
}

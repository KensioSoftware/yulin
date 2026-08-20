import type { SimAws } from "../../aws/sim-aws.js";
import type { SimRestApiTokenAuthorizerEvent } from "../serve/auth/sim-rest-api-authorizer-event.js";
import type { SimRestApiRequestAuthorizerEvent } from "../serve/auth/sim-rest-api-request-authorizer-event.js";
import { simRestApiProxyLambdaAuthorizer } from "./sim-rest-api-proxy-lambda-authorizer.js";

/**
 * How the methods of a test's REST API say who may call them.
 */
export interface SimRestApiProxyAuthorization {
  readonly authorizationType: string;
  readonly authorizerId?: string | undefined;
  readonly authorizationScopes?: readonly string[] | undefined;
}

/**
 * What a test asks for when it wants its REST API gated by an authorizer.
 *
 * The two Lambda kinds hand their function different events, so a test says
 * which it is writing by which handler it supplies rather than by naming a
 * type. A `REQUEST` handler wins where both are given.
 */
export interface SimRestApiProxyAuthorizerInput {
  /**
   * The Account the functions belong to, which need not be the API's. An
   * integration URI and an authorizer URI are each free to name another one.
   */
  readonly functionAccountId: string;
  readonly roleArn: string;
  /** The function a `TOKEN` authorizer invokes, which decides every request. */
  readonly authorizerHandler:
    | ((event: SimRestApiTokenAuthorizerEvent) => unknown)
    | undefined;
  /** The function a `REQUEST` authorizer invokes instead. */
  readonly requestAuthorizerHandler:
    | ((event: SimRestApiRequestAuthorizerEvent) => unknown)
    | undefined;
  /**
   * The user pools a `COGNITO_USER_POOLS` authorizer accepts tokens from,
   * named by ARN. Supplying them gates every method with that authorizer
   * instead of a Lambda one, and it invokes nothing.
   */
  readonly cognitoUserPoolArns: readonly string[] | undefined;
  /** The scopes each method asks a verified token for. */
  readonly authorizationScopes: readonly string[];
  /**
   * Whether every method is authorized by IAM, which is what an `AWS_IAM`
   * method asks for. An API asking for this names no authorizer.
   */
  readonly iamAuthorization: boolean;
  /**
   * Where the authorizer looks for what identifies a caller. A `REQUEST`
   * authorizer writes as many expressions as it likes, separated by commas.
   */
  readonly authorizerIdentitySource: string;
  /**
   * How long a Lambda authorizer holds a decision for, with zero meaning none,
   * which is what an authorizer says nothing about it gets.
   */
  readonly authorizerResultTtlSeconds: number;
  /**
   * Whether the authorizer's function grants the API permission to invoke it,
   * under the ARN naming the authorizer. A test about that permission turns
   * this off.
   */
  readonly authorizerInvokePermission: boolean;
}

/**
 * Create the authorizer a test's REST API gates its methods with, and answer
 * how the methods name it.
 *
 * An API with no authorizer function, no user pools and no IAM authorization
 * declares open methods, which is what a test about anything else wants. An
 * `AWS_IAM` method names no authorizer, so a test asking for both is asking
 * for something PutMethod refuses, and gets that refusal.
 */
export async function simRestApiProxyAuthorization(
  simAws: SimAws,
  input: SimRestApiProxyAuthorizerInput,
  restApiId: string,
): Promise<SimRestApiProxyAuthorization> {
  const providerARNs = input.cognitoUserPoolArns;

  if (providerARNs !== undefined) {
    const { id } = await simAws.apiGateway().createAuthorizer({
      input: {
        restApiId,
        name: "orders-user-pools",
        type: "COGNITO_USER_POOLS",
        providerARNs,
        identitySource: input.authorizerIdentitySource,
      },
    });

    return {
      authorizationType: "COGNITO_USER_POOLS",
      authorizerId: id,
      authorizationScopes: input.authorizationScopes,
    };
  }

  const authorizerId = await simRestApiProxyLambdaAuthorizer(
    simAws,
    input,
    restApiId,
  );

  if (authorizerId !== undefined) {
    return { authorizationType: "CUSTOM", authorizerId };
  }

  return {
    authorizationType: input.iamAuthorization ? "AWS_IAM" : "NONE",
  };
}

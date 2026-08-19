import type { SimAws } from "../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../lambda/function/code/lambda-zip-file-input.js";
import type { SimRestApiAuthorizerType } from "./authorizer/sim-rest-api-authorizer.js";
import type { SimRestApiTokenAuthorizerEvent } from "../serve/auth/sim-rest-api-authorizer-event.js";
import type { SimRestApiRequestAuthorizerEvent } from "../serve/auth/sim-rest-api-request-authorizer-event.js";
import { simApiGatewayServicePrincipal } from "../sim-api-gateway-service-principal.js";

/**
 * What a test asks for when it wants its REST API gated by a Lambda
 * authorizer.
 *
 * The two kinds hand their function different events, so a test says which it
 * is writing by which handler it supplies rather than by naming a type. A
 * `REQUEST` handler wins where both are given.
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
   * Where the authorizer looks for what identifies a caller. A `REQUEST`
   * authorizer writes as many expressions as it likes, separated by commas.
   */
  readonly authorizerIdentitySource: string;
  /**
   * Whether the authorizer's function grants the API permission to invoke it,
   * under the ARN naming the authorizer. A test about that permission turns
   * this off.
   */
  readonly authorizerInvokePermission: boolean;
}

/**
 * The kind of authorizer a test asked for and the code of its function, or
 * nothing at all where it asked for no authorizer.
 *
 * The two handlers are read apart rather than together because each is written
 * against the event its own kind of authorizer receives.
 */
function authorizerFunction(
  input: SimRestApiProxyAuthorizerInput,
):
  | { readonly type: SimRestApiAuthorizerType; readonly code: Uint8Array }
  | undefined {
  const { authorizerHandler, requestAuthorizerHandler } = input;

  if (requestAuthorizerHandler !== undefined) {
    return {
      type: "REQUEST",
      code: makeLambdaZipFileInput(requestAuthorizerHandler),
    };
  }

  if (authorizerHandler !== undefined) {
    return { type: "TOKEN", code: makeLambdaZipFileInput(authorizerHandler) };
  }

  return undefined;
}

/**
 * Create the authorizer a test's REST API gates its methods with, and answer
 * its id.
 *
 * The function is a second one beside the integration's, because a REST API
 * authorizer is invoked under an ARN naming the authorizer rather than any
 * method, and needs a grant of its own. That grant is the one CDK's
 * `TokenAuthorizer` and `RequestAuthorizer` write.
 */
export async function simRestApiProxyAuthorizer(
  simAws: SimAws,
  input: SimRestApiProxyAuthorizerInput,
  restApiId: string,
): Promise<string | undefined> {
  const authorizerFn = authorizerFunction(input);

  if (authorizerFn === undefined) {
    return undefined;
  }

  const lambda = simAws.account(input.functionAccountId).lambda();
  const name = `${restApiId}-authorizer`;
  const created = await lambda.createFunction({
    input: {
      FunctionName: name,
      Role: input.roleArn,
      Code: { ZipFile: authorizerFn.code },
    },
  });

  const { id } = await simAws.apiGateway().createAuthorizer({
    input: {
      restApiId,
      name: "orders-authorizer",
      type: authorizerFn.type,
      authorizerUri: created.FunctionArn,
      identitySource: input.authorizerIdentitySource,
    },
  });

  if (input.authorizerInvokePermission) {
    const { accountId, regionName } =
      simAws.accountRegionScope().accountRegionScope;

    await lambda.addPermission({
      input: {
        FunctionName: name,
        StatementId: "api-gateway-invoke-authorizer",
        Action: "lambda:InvokeFunction",
        Principal: simApiGatewayServicePrincipal,
        SourceArn:
          `arn:aws:execute-api:${regionName}:${accountId}:` +
          `${restApiId}/authorizers/${id}`,
      },
    });
  }

  return id;
}

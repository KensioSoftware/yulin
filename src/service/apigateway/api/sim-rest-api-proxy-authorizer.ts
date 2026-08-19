import type { SimAws } from "../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../lambda/function/code/lambda-zip-file-input.js";
import type { SimRestApiTokenAuthorizerEvent } from "../serve/auth/sim-rest-api-authorizer-event.js";
import { simApiGatewayServicePrincipal } from "../sim-api-gateway-service-principal.js";

/**
 * What a test asks for when it wants its REST API gated by a `TOKEN`
 * authorizer.
 */
export interface SimRestApiProxyAuthorizerInput {
  /**
   * The Account the functions belong to, which need not be the API's. An
   * integration URI and an authorizer URI are each free to name another one.
   */
  readonly functionAccountId: string;
  readonly roleArn: string;
  /** The function the authorizer invokes, which decides every request. */
  readonly authorizerHandler:
    | ((event: SimRestApiTokenAuthorizerEvent) => unknown)
    | undefined;
  /** The header the authorizer takes its token from. */
  readonly authorizerIdentitySource: string;
  /**
   * Whether the authorizer's function grants the API permission to invoke it,
   * under the ARN naming the authorizer. A test about that permission turns
   * this off.
   */
  readonly authorizerInvokePermission: boolean;
}

/**
 * Create the authorizer a test's REST API gates its methods with, and answer
 * its id.
 *
 * The function is a second one beside the integration's, because a REST API
 * authorizer is invoked under an ARN naming the authorizer rather than any
 * method, and needs a grant of its own. That grant is the one CDK's
 * `TokenAuthorizer` writes.
 */
export async function simRestApiProxyAuthorizer(
  simAws: SimAws,
  input: SimRestApiProxyAuthorizerInput,
  restApiId: string,
): Promise<string | undefined> {
  const handler = input.authorizerHandler;

  if (handler === undefined) {
    return undefined;
  }

  const lambda = simAws.account(input.functionAccountId).lambda();
  const name = `${restApiId}-authorizer`;
  const created = await lambda.createFunction({
    input: {
      FunctionName: name,
      Role: input.roleArn,
      Code: { ZipFile: makeLambdaZipFileInput(handler) },
    },
  });

  const { id } = await simAws.apiGateway().createAuthorizer({
    input: {
      restApiId,
      name: "orders-authorizer",
      type: "TOKEN",
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

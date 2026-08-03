import type { SimAws } from "../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../lambda/function/code/lambda-zip-file-input.js";
import type { SimCreateRouteCommandInput } from "../command/route/route.command.js";
import { simApiGatewayServicePrincipal } from "../serve/auth/sim-http-api-invoke-authorizer.js";
import type { SimHttpApiAuthorizerEvent } from "../serve/auth/sim-http-api-authorizer-event.js";

/**
 * A Lambda `REQUEST` authorizer every route of a test's API goes through.
 */
export interface SimHttpApiProxyRequestAuthorizer {
  /** The function code the authorizer invokes. */
  readonly handler: (event: SimHttpApiAuthorizerEvent) => unknown;
  readonly functionName: string;
  readonly identitySource: readonly string[];
  readonly enableSimpleResponses: boolean;
  /**
   * The `AuthorizerUri`, which defaults to the function just created. A test
   * about an authorizer whose function is not there names one nothing created.
   */
  readonly uri?: string | undefined;
  /**
   * Whether the authorizer's function grants the API permission to invoke it.
   *
   * The grant names the authorizer rather than any route, so it is a separate
   * one from the integration's. A test about the permission itself turns this
   * off.
   */
  readonly invokePermission: boolean;
}

interface SimHttpApiProxyRequestAuthorizerInput {
  readonly apiId: string;
  readonly roleArn: string;
  readonly authorizer: SimHttpApiProxyRequestAuthorizer;
  readonly authorizationScopes: readonly string[];
}

/**
 * Create the function a test's Lambda authorizer invokes, the authorizer
 * itself, and the permission letting the API invoke it, and answer the
 * authorization every route of that API is then created with.
 *
 * Three commands and a function stand between a test and a `CUSTOM` route it
 * can serve, and a test about the authorizer is about none of them.
 */
export async function simHttpApiProxyRequestAuthorizer(
  simAws: SimAws,
  input: SimHttpApiProxyRequestAuthorizerInput,
): Promise<SimCreateRouteCommandInput> {
  const { apiId, authorizer } = input;
  const simLambda = simAws.lambda();
  const { FunctionArn: functionArn } = await simLambda.createFunction({
    input: {
      FunctionName: authorizer.functionName,
      Role: input.roleArn,
      Code: { ZipFile: makeLambdaZipFileInput(authorizer.handler) },
    },
  });

  const created = await simAws.apiGatewayV2().createAuthorizer({
    input: {
      ApiId: apiId,
      Name: "request-authorizer",
      AuthorizerType: "REQUEST",
      AuthorizerUri: authorizer.uri ?? functionArn,
      AuthorizerPayloadFormatVersion: "2.0",
      EnableSimpleResponses: authorizer.enableSimpleResponses,
      IdentitySource: [...authorizer.identitySource],
    },
  });

  if (authorizer.invokePermission) {
    const { accountId, regionName } =
      simAws.accountRegionScope().accountRegionScope;
    await simLambda.addPermission({
      input: {
        FunctionName: authorizer.functionName,
        StatementId: "api-gateway-invoke-authorizer",
        Action: "lambda:InvokeFunction",
        Principal: simApiGatewayServicePrincipal,
        SourceArn:
          `arn:aws:execute-api:${regionName}:${accountId}:${apiId}` +
          `/authorizers/${created.AuthorizerId}`,
      },
    });
  }

  // The scopes are passed on rather than dropped, so a test asking for one on
  // a route a Lambda authorizer decides is refused by CreateRoute rather than
  // quietly getting an unchecked scope.
  return {
    AuthorizationType: "CUSTOM",
    AuthorizerId: created.AuthorizerId,
    AuthorizationScopes: input.authorizationScopes,
  };
}

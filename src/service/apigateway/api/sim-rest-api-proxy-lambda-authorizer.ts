import type { SimAws } from "../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../lambda/function/code/lambda-zip-file-input.js";
import type { SimRestApiLambdaAuthorizerType } from "./authorizer/sim-rest-api-lambda-authorizer.js";
import { simApiGatewayServicePrincipal } from "../sim-api-gateway-service-principal.js";
import type { SimRestApiProxyAuthorizerInput } from "./sim-rest-api-proxy-authorizer.js";

/**
 * The kind of authorizer a test asked for and the code of its function, or
 * nothing at all where it asked for no Lambda authorizer.
 *
 * The two handlers are read apart rather than together because each is written
 * against the event its own kind of authorizer receives.
 */
function authorizerFunction(
  input: SimRestApiProxyAuthorizerInput,
):
  | { readonly type: SimRestApiLambdaAuthorizerType; readonly code: Uint8Array }
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
 * Create the Lambda authorizer a test's REST API gates its methods with, and
 * answer its id.
 *
 * The function is a second one beside the integration's, because a REST API
 * authorizer is invoked under an ARN naming the authorizer rather than any
 * method, and needs a grant of its own. That grant is the one CDK's
 * `TokenAuthorizer` and `RequestAuthorizer` write.
 */
export async function simRestApiProxyLambdaAuthorizer(
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
      authorizerResultTtlInSeconds: input.authorizerResultTtlSeconds,
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

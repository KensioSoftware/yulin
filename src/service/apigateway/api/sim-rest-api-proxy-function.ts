import type { SimAws } from "../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../lambda/function/code/lambda-zip-file-input.js";
import { simApiGatewayServicePrincipal } from "../serve/sim-rest-api-integration-invocation.js";

interface SimRestApiProxyFunctionInput {
  readonly functionAccountId: string;
  readonly functionName: string;
  readonly roleArn: string;
  readonly handler: (event: never) => unknown;
}

/**
 * Create the simulated Lambda function a test's REST API proxies to, and
 * answer its ARN.
 */
export async function simRestApiProxyFunction(
  simAws: SimAws,
  input: SimRestApiProxyFunctionInput,
): Promise<string> {
  const { FunctionArn: functionArn } = await simAws
    .account(input.functionAccountId)
    .lambda()
    .createFunction({
      input: {
        FunctionName: input.functionName,
        Role: input.roleArn,
        Code: { ZipFile: makeLambdaZipFileInput(input.handler) },
      },
    });

  return functionArn;
}

/**
 * Grant the API permission to invoke the function, the way CDK writes it.
 *
 * The ARN names the API's own Account and Region, which is where the request
 * arrives, whatever Account the function belongs to. Every stage and method of
 * the API is wildcarded, as a `LambdaRestApi` grant is.
 */
export async function simRestApiInvokePermission(
  simAws: SimAws,
  input: { readonly functionAccountId: string; readonly functionName: string },
  restApiId: string,
): Promise<void> {
  const { accountId, regionName } =
    simAws.accountRegionScope().accountRegionScope;

  await simAws
    .account(input.functionAccountId)
    .lambda()
    .addPermission({
      input: {
        FunctionName: input.functionName,
        StatementId: "api-gateway-invoke",
        Action: "lambda:InvokeFunction",
        Principal: simApiGatewayServicePrincipal,
        SourceArn: `arn:aws:execute-api:${regionName}:${accountId}:${restApiId}/*/*/*`,
      },
    });
}

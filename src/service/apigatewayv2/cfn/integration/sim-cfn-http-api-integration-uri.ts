/**
 * The API Gateway integration URI form that wraps a Lambda function ARN in an
 * API Gateway path:
 *
 *   arn:aws:apigateway:eu-west-2:lambda:path/2015-03-31/functions/<function-arn>/invocations
 *
 * The date is the Lambda invoke API version and is part of the literal, not
 * something a template chooses.
 */
const apiGatewayLambdaPathUri =
  /^arn:[^:]+:apigateway:[^:]+:lambda:path\/2015-03-31\/functions\/(?<functionArn>arn:[^/]+)\/invocations$/;

/**
 * Read the Lambda function ARN an `IntegrationUri` names.
 *
 * CDK emits the bare function ARN, and a hand-written template may use either
 * that or the longer API Gateway path form, so both reach the same function.
 * A URI in neither form is handed on unchanged, so CreateIntegration is what
 * refuses it and says what an integration URI may be.
 */
export function simCfnHttpApiIntegrationUri(uri: string): string {
  return apiGatewayLambdaPathUri.exec(uri)?.groups?.["functionArn"] ?? uri;
}

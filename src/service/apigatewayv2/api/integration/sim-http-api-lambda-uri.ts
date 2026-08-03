import { SimApiGatewayV2BadRequest } from "../../error/sim-api-gateway-v2.error.js";

const lambdaFunctionArn =
  /^arn:aws:lambda:(?<regionName>[a-z0-9-]+):(?<accountId>\d{12}):function:(?<functionName>[a-zA-Z0-9-_]+)$/;

/**
 * The other form an integration URI is written in, wrapping a Lambda function
 * ARN in an API Gateway path:
 *
 *   arn:aws:apigateway:eu-west-2:lambda:path/2015-03-31/functions/<function-arn>/invocations
 *
 * The date is the Lambda invoke API version and is part of the literal rather
 * than something a caller chooses. An OpenAPI document being imported writes
 * this form, and so does a hand-written CloudFormation template, while CDK
 * emits the bare function ARN.
 */
const apiGatewayLambdaPathUri =
  /^arn:[^:]+:apigateway:[^:]+:lambda:path\/2015-03-31\/functions\/(?<functionArn>arn:[^/]+)\/invocations$/;

/**
 * A URI naming the Lambda function something on an API invokes: the
 * `IntegrationUri` of an `AWS_PROXY` integration, or the `AuthorizerUri` of a
 * `REQUEST` authorizer. Both are written the same way.
 *
 * Only an unqualified function ARN is accepted. A version or alias qualifier
 * on the end names a published function version, and simulated Lambda has no
 * versions, so one is refused rather than invoked as the unpublished function
 * it is not.
 *
 * Both URI forms reach the same function, and both are held as the function
 * ARN, which is what the API hands back. Reading them here rather than in each
 * caller is what lets an SDK caller, a template and an imported document write
 * whichever form they write.
 */
export class SimHttpApiLambdaUri {
  public readonly uri: string;
  public readonly regionName: string;
  public readonly accountId: string;
  public readonly functionName: string;

  private constructor(uri: string, groups: Record<string, string>) {
    this.uri = uri;
    /* v8 ignore next 3 -- the pattern that matched fills all three groups */
    this.regionName = groups["regionName"] ?? "";
    this.accountId = groups["accountId"] ?? "";
    this.functionName = groups["functionName"] ?? "";
  }

  /**
   * Read an integration URI, refusing anything that is not a Lambda function
   * ARN.
   */
  static parse(uri: string): SimHttpApiLambdaUri {
    return this.read(
      "IntegrationUri",
      uri,
      "an AWS_PROXY integration is simulated only for an unqualified Lambda " +
        "function ARN",
    );
  }

  /**
   * Read a `REQUEST` authorizer's URI, which names its function the same way.
   */
  static parseAuthorizerUri(uri: string): SimHttpApiLambdaUri {
    return this.read(
      "AuthorizerUri",
      uri,
      "a REQUEST authorizer is simulated only for an unqualified Lambda " +
        "function ARN",
    );
  }

  private static read(
    option: string,
    uri: string,
    refusal: string,
  ): SimHttpApiLambdaUri {
    const functionArn = this.functionArn(uri);
    const groups = lambdaFunctionArn.exec(functionArn)?.groups;

    if (groups === undefined) {
      throw new SimApiGatewayV2BadRequest(
        `${option} '${uri}' is not a simulated invocation target: ` +
          `${refusal}, such as ` +
          `arn:aws:lambda:eu-west-2:111111111111:function:orders`,
      );
    }

    return new SimHttpApiLambdaUri(functionArn, groups);
  }

  /**
   * The function ARN a URI names, in either form it is written in.
   */
  private static functionArn(uri: string): string {
    return apiGatewayLambdaPathUri.exec(uri)?.groups?.["functionArn"] ?? uri;
  }
}

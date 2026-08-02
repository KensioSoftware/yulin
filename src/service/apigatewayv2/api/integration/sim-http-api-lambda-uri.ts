import { SimApiGatewayV2BadRequest } from "../../error/sim-api-gateway-v2.error.js";

const lambdaFunctionArn =
  /^arn:aws:lambda:(?<regionName>[a-z0-9-]+):(?<accountId>\d{12}):function:(?<functionName>[a-zA-Z0-9-_]+)$/;

/**
 * The `IntegrationUri` of an `AWS_PROXY` integration: the ARN of the Lambda
 * function the integration invokes.
 *
 * Only an unqualified function ARN is accepted. A version or alias qualifier
 * on the end names a published function version, and simulated Lambda has no
 * versions, so one is refused rather than invoked as the unpublished function
 * it is not.
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
    const groups = lambdaFunctionArn.exec(uri)?.groups;

    if (groups === undefined) {
      throw new SimApiGatewayV2BadRequest(
        `IntegrationUri '${uri}' is not a simulated integration target: an ` +
          `AWS_PROXY integration is simulated only for an unqualified Lambda ` +
          `function ARN, such as ` +
          `arn:aws:lambda:eu-west-2:111111111111:function:orders`,
      );
    }

    return new SimHttpApiLambdaUri(uri, groups);
  }
}

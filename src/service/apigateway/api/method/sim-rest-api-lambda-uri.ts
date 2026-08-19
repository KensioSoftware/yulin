import { simLambdaInvocationUriOf } from "../../../lambda/function/uri/sim-lambda-invocation-uri.js";
import { SimApiGatewayBadRequest } from "../../error/sim-api-gateway.error.js";

/**
 * A URI naming the Lambda function a REST API method invokes.
 *
 * It is written either as the bare function ARN or wrapped in the API Gateway
 * invoke path CDK, CloudFormation and OpenAPI documents all emit. The string
 * is kept as it was given, because `GetIntegration` echoes back what was
 * configured rather than a form of its own, and the function ARN is held
 * beside it for whatever has to reach the function.
 *
 * A version or alias qualifier on the end of the ARN is held apart from the
 * function name, because the name finds the function and the qualifier picks
 * which of its versions runs. Neither is resolved here. An integration built
 * on an alias therefore follows that alias wherever it is moved to afterwards.
 */
export class SimRestApiLambdaUri {
  /** The URI as it was configured, which is what the API hands back. */
  public readonly uri: string;

  /** The function ARN the URI named, with any wrapper taken off. */
  public readonly functionArn: string;

  public readonly regionName: string;
  public readonly accountId: string;
  public readonly functionName: string;
  public readonly qualifier: string | undefined;

  private constructor(properties: {
    readonly uri: string;
    readonly functionArn: string;
    readonly regionName: string;
    readonly accountId: string;
    readonly functionName: string;
    readonly qualifier: string | undefined;
  }) {
    this.uri = properties.uri;
    this.functionArn = properties.functionArn;
    this.regionName = properties.regionName;
    this.accountId = properties.accountId;
    this.functionName = properties.functionName;
    this.qualifier = properties.qualifier;
  }

  /**
   * Read an integration URI, refusing anything other than a Lambda function.
   */
  static parse(uri: string): SimRestApiLambdaUri {
    const invocation = simLambdaInvocationUriOf(uri);

    if (invocation === undefined) {
      throw new SimApiGatewayBadRequest(
        `uri '${uri}' is not a simulated invocation target: an AWS_PROXY ` +
          `integration is simulated only for a Lambda function ARN, with or ` +
          `without a version or alias qualifier, such as ` +
          `arn:aws:lambda:eu-west-2:111111111111:function:orders or ` +
          `arn:aws:apigateway:eu-west-2:lambda:path/2015-03-31/functions/` +
          `arn:aws:lambda:eu-west-2:111111111111:function:orders/invocations`,
      );
    }

    return new SimRestApiLambdaUri({ ...invocation, uri });
  }
}

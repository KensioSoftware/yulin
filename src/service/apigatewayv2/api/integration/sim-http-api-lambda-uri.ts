import { simLambdaInvocationUriOf } from "../../../lambda/function/uri/sim-lambda-invocation-uri.js";
import { SimApiGatewayV2BadRequest } from "../../error/sim-api-gateway-v2.error.js";

/**
 * A URI naming the Lambda function something on an API invokes: the
 * `IntegrationUri` of an `AWS_PROXY` integration, or the `AuthorizerUri` of a
 * `REQUEST` authorizer. Both are written the same way.
 *
 * A version or alias qualifier on the end of the function ARN is held apart
 * from the function name, because the two are resolved separately. The name
 * finds the function and the qualifier picks which of its versions runs.
 * Neither is resolved here. That is what lets a route built on an alias follow
 * that alias wherever it is moved to afterwards.
 *
 * A URI is written either as the bare function ARN or wrapped in an API
 * Gateway invoke path, and both reach the same function. Reading them through
 * one reader is what lets an SDK caller, a template and an imported document
 * write whichever form they write.
 */
export class SimHttpApiLambdaUri {
  public readonly uri: string;
  public readonly regionName: string;
  public readonly accountId: string;
  public readonly functionName: string;

  /**
   * The published version or the alias the URI named, if it named one.
   */
  public readonly qualifier: string | undefined;

  private constructor(properties: {
    readonly uri: string;
    readonly regionName: string;
    readonly accountId: string;
    readonly functionName: string;
    readonly qualifier: string | undefined;
  }) {
    this.uri = properties.uri;
    this.regionName = properties.regionName;
    this.accountId = properties.accountId;
    this.functionName = properties.functionName;
    this.qualifier = properties.qualifier;
  }

  /**
   * Read an integration URI, refusing anything that is not a Lambda function
   * ARN.
   */
  static parse(uri: string): SimHttpApiLambdaUri {
    return this.read(
      "IntegrationUri",
      uri,
      "an AWS_PROXY integration is simulated only for a Lambda function ARN, " +
        "with or without a version or alias qualifier",
    );
  }

  /**
   * Read a `REQUEST` authorizer's URI, which names its function the same way.
   */
  static parseAuthorizerUri(uri: string): SimHttpApiLambdaUri {
    return this.read(
      "AuthorizerUri",
      uri,
      "a REQUEST authorizer is simulated only for a Lambda function ARN, " +
        "with or without a version or alias qualifier",
    );
  }

  private static read(
    option: string,
    uri: string,
    refusal: string,
  ): SimHttpApiLambdaUri {
    const invocation = simLambdaInvocationUriOf(uri);

    if (invocation === undefined) {
      throw new SimApiGatewayV2BadRequest(
        `${option} '${uri}' is not a simulated invocation target: ` +
          `${refusal}, such as ` +
          `arn:aws:lambda:eu-west-2:111111111111:function:orders or ` +
          `arn:aws:lambda:eu-west-2:111111111111:function:orders:live`,
      );
    }

    return new SimHttpApiLambdaUri({
      ...invocation,
      uri: invocation.functionArn,
    });
  }
}

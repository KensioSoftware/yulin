import { SimApiGatewayV2BadRequest } from "../../error/sim-api-gateway-v2.error.js";

const lambdaFunctionArn =
  /^arn:aws:lambda:(?<regionName>[a-z0-9-]+):(?<accountId>\d{12}):function:(?<functionName>[a-zA-Z0-9-_]+)$/;

/**
 * A version number or an alias name on the end of a function ARN. `$LATEST`
 * is one of them, which is what the `$` is there for.
 */
const lambdaQualifier = /^[a-zA-Z0-9-_$]+$/;

/**
 * How many colon-separated fields an unqualified function ARN has. A
 * qualified one has an eighth.
 */
const functionArnFieldCount = 7;

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
 * A version or alias qualifier on the end of the function ARN is held apart
 * from the function name, because the two are resolved separately. The name
 * finds the function and the qualifier picks which of its versions runs.
 * Neither is resolved here. That is what lets a route built on an alias follow
 * that alias wherever it is moved to afterwards.
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

  /**
   * The published version or the alias the URI named, if it named one.
   */
  public readonly qualifier: string | undefined;

  private constructor(
    uri: string,
    qualifier: string | undefined,
    groups: Record<string, string>,
  ) {
    this.uri = uri;
    this.qualifier = qualifier;
    /* v8 ignore next 3 -- the pattern that matched fills each of these three */
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
    const functionArn = this.functionArn(uri);
    const { unqualified, qualifier } = this.split(functionArn);
    const groups = lambdaFunctionArn.exec(unqualified)?.groups;

    if (groups === undefined || !this.qualifierAccepted(qualifier)) {
      throw new SimApiGatewayV2BadRequest(
        `${option} '${uri}' is not a simulated invocation target: ` +
          `${refusal}, such as ` +
          `arn:aws:lambda:eu-west-2:111111111111:function:orders or ` +
          `arn:aws:lambda:eu-west-2:111111111111:function:orders:live`,
      );
    }

    return new SimHttpApiLambdaUri(functionArn, qualifier, groups);
  }

  /**
   * The function ARN a URI names, in either form it is written in.
   */
  private static functionArn(uri: string): string {
    return apiGatewayLambdaPathUri.exec(uri)?.groups?.["functionArn"] ?? uri;
  }

  /**
   * A function ARN split from the qualifier on the end of it.
   *
   * The split is by field rather than by pattern, since a function name and a
   * qualifier are written from the same characters and only the colon between
   * them tells the two apart.
   */
  private static split(functionArn: string): {
    readonly unqualified: string;
    readonly qualifier: string | undefined;
  } {
    const fields = functionArn.split(":");

    return fields.length > functionArnFieldCount
      ? {
          unqualified: fields.slice(0, functionArnFieldCount).join(":"),
          qualifier: fields.slice(functionArnFieldCount).join(":"),
        }
      : { unqualified: functionArn, qualifier: undefined };
  }

  /**
   * Whether what came off the end of the ARN could be a qualifier at all. A
   * URI carrying more fields than a qualified function ARN has is refused
   * here.
   */
  private static qualifierAccepted(qualifier: string | undefined): boolean {
    return qualifier === undefined || lambdaQualifier.test(qualifier);
  }
}

/**
 * A Lambda function ARN, with the fields an ARN carries broken out.
 */
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
 * The Lambda function a URI names, and the version or alias qualifier that
 * came with it.
 */
export interface SimLambdaInvocationUri {
  /** The function ARN, in the form the reading service hands back. */
  readonly functionArn: string;
  readonly regionName: string;
  readonly accountId: string;
  readonly functionName: string;
  /** The published version or the alias the URI named, if it named one. */
  readonly qualifier: string | undefined;
}

/**
 * Read a URI naming the Lambda function something invokes.
 *
 * Both API Gateway services write these, for an `AWS_PROXY` integration and
 * for a `REQUEST` authorizer, in either of the two forms above. Neither the
 * function nor the qualifier is resolved here. The name finds the function and
 * the qualifier picks which of its versions runs, and holding them apart is
 * what lets an integration built on an alias follow that alias wherever it is
 * moved to afterwards.
 *
 * A URI naming anything other than a Lambda function reads as `undefined`.
 * Each service refuses it in its own words, because the option carrying the
 * URI is named differently in each of them.
 */
export function simLambdaInvocationUriOf(
  uri: string,
): SimLambdaInvocationUri | undefined {
  const functionArn = wrappedFunctionArn(uri);
  const { unqualified, qualifier } = splitQualifier(functionArn);
  const groups = lambdaFunctionArn.exec(unqualified)?.groups;

  if (groups === undefined || !qualifierAccepted(qualifier)) {
    return undefined;
  }

  return {
    functionArn,
    /* v8 ignore next 3 -- the pattern that matched fills each of these three */
    regionName: groups["regionName"] ?? "",
    accountId: groups["accountId"] ?? "",
    functionName: groups["functionName"] ?? "",
    qualifier,
  };
}

/**
 * The function ARN a URI names, in either form it is written in.
 */
function wrappedFunctionArn(uri: string): string {
  return apiGatewayLambdaPathUri.exec(uri)?.groups?.["functionArn"] ?? uri;
}

/**
 * A function ARN split from the qualifier on the end of it.
 *
 * The split is by field rather than by pattern, since a function name and a
 * qualifier are written from the same characters and only the colon between
 * them tells the two apart.
 */
function splitQualifier(functionArn: string): {
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
 * Whether what came off the end of the ARN could be a qualifier at all. A URI
 * carrying more fields than a qualified function ARN has is refused here.
 */
function qualifierAccepted(qualifier: string | undefined): boolean {
  return qualifier === undefined || lambdaQualifier.test(qualifier);
}

/**
 * The service principal Lambda holds an execution role as.
 *
 * An execution role's trust policy names it, and so does the
 * `iam:PassedToService` condition a deploy policy is commonly written with.
 */
export const simLambdaServicePrincipal = "lambda.amazonaws.com";

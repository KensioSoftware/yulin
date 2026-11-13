/**
 * The first of the two IAM actions every Function URL request is authorized
 * against.
 *
 * Real AWS keeps it apart from `lambda:InvokeFunction`, so a policy can name
 * the HTTP endpoint on its own, but since October 2025 a Function URL takes
 * both, as described in [Control access to Lambda function
 * URLs](https://docs.aws.amazon.com/lambda/latest/dg/urls-auth.html).
 */
export const simLambdaInvokeFunctionUrlAction = "lambda:InvokeFunctionUrl";

/**
 * The second action every Function URL request is authorized against, the one
 * the Invoke API maps to.
 *
 * A grant restricts it to Function URL calls with the
 * `lambda:InvokedViaFunctionUrl` condition, which every URL request supplies.
 */
export const simLambdaInvokeFunctionAction = "lambda:InvokeFunction";

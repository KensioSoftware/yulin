import type {
  SimAwsCaller,
  SimAwsPrincipal,
} from "../../../aws/caller/sim-aws-caller.js";

/**
 * The IAM action a Function URL invocation is authorized against.
 *
 * This is deliberately not `lambda:InvokeFunction`, which is what the Invoke
 * API maps to. Real AWS separates the two so a policy can grant the HTTP
 * endpoint without granting the SDK operation, and a test asserting on that
 * distinction should see it hold here.
 *
 * That is the whole rule for a caller signing its own request. It is not the
 * whole rule for a CloudFront origin access control, which needs
 * `lambda:InvokeFunction` as well.
 */
export const simLambdaInvokeFunctionUrlAction = "lambda:InvokeFunctionUrl";

/**
 * The action the Invoke API maps to, which reaching a Function URL through a
 * CloudFront origin access control takes on top of the URL action.
 *
 * Real Lambda answers an origin access control granted only the URL action
 * with 403 and never runs the handler. Both grants go to the CloudFront
 * service principal and both are conditioned on the Distribution, as described
 * in [Restrict access to an AWS Lambda function URL
 * origin](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-lambda.html).
 */
export const simLambdaInvokeFunctionAction = "lambda:InvokeFunction";

/**
 * The service principal CloudFront reaches an Origin as.
 *
 * Named here rather than imported from simulated CloudFront, so that simulated
 * Lambda goes on depending on nothing in that service. What real Lambda wants
 * the second action for is the principal, whatever is simulating it.
 */
const cloudFrontServicePrincipal = "cloudfront.amazonaws.com";

/**
 * Whether reaching this Function URL also takes `lambda:InvokeFunction`.
 *
 * True for CloudFront, and false for anything else, which is the distinction
 * real Lambda draws: a caller signing the request itself needs the URL action
 * alone.
 */
export function simLambdaUrlRequiresInvokeFunction(
  caller: SimAwsCaller,
): boolean {
  const principal = callerPrincipal(caller);

  if (principal.kind !== "service") {
    return false;
  }

  return principal.service === cloudFrontServicePrincipal;
}

/**
 * The principal a caller names.
 *
 * Credentials name one too, but only once IAM has authenticated them, and
 * nothing reaching a Function URL as a service principal presents any: an
 * origin access control states who it is at the boundary instead.
 */
function callerPrincipal(caller: SimAwsCaller): SimAwsPrincipal {
  if (caller.kind === "resolved") {
    return caller.principal;
  }

  if (caller.kind === "credentials") {
    return { kind: "anonymous" };
  }

  return caller;
}

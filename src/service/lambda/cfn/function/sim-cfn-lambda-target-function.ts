import {
  type SimLambdaFunctionReference,
  simLambdaFunctionReferenceOf,
} from "../../function/sim-lambda-function-reference.js";

/**
 * Get the function name a template property pointing at a function names.
 *
 * `AWS::Lambda::Url` reaches this through `TargetFunctionArn`, and
 * `AWS::Lambda::EventSourceMapping` and `AWS::Lambda::Version` through
 * `FunctionName`. Templates reach either in two ways: `Fn::GetAtt` on the
 * function, giving a full ARN, or `Ref`, giving the function name. Both are
 * accepted, as both are valid template ways to point at the same function.
 */
export function simCfnLambdaTargetFunctionName(
  targetFunctionArn: string,
): string {
  return simLambdaFunctionReferenceOf(targetFunctionArn).functionName;
}

/**
 * Get the function and the version or alias a template property names.
 *
 * `AWS::Lambda::Permission` points at whatever it grants on, and CDK writes
 * that as the qualified ARN of a version or an alias rather than as a separate
 * qualifier. The grant belongs on what the template named, so the qualifier is
 * carried through rather than dropped the way the callers acting on the
 * function itself drop it.
 */
export function simCfnLambdaTargetFunction(
  targetFunctionArn: string,
): SimLambdaFunctionReference {
  return simLambdaFunctionReferenceOf(targetFunctionArn);
}

import { simLambdaFunctionNameOf } from "../../function/sim-lambda-function-name.js";

/**
 * Get the function name a template property pointing at a function names.
 *
 * `AWS::Lambda::Url` reaches this through `TargetFunctionArn`, and
 * `AWS::Lambda::Permission` and `AWS::Lambda::EventSourceMapping` through
 * `FunctionName`. Templates reach either in two ways: `Fn::GetAtt` on the
 * function, giving a full ARN, or `Ref`, giving the function name. Both are
 * accepted, as both are valid template ways to point at the same function.
 */
export function simCfnLambdaTargetFunctionName(
  targetFunctionArn: string,
): string {
  return simLambdaFunctionNameOf(targetFunctionArn);
}

const functionArnSeparator = ":function:";

/**
 * Get the function name a template property pointing at a function names.
 *
 * `AWS::Lambda::Url` reaches this through `TargetFunctionArn` and
 * `AWS::Lambda::Permission` through `FunctionName`, and templates reach either
 * in two ways: `Fn::GetAtt` on the function, giving a full ARN, or `Ref`,
 * giving the function name. Both are accepted, as both are valid template ways
 * to point at the same function. A version or alias qualifier on the ARN is
 * dropped, as qualified functions are not simulated.
 */
export function simCfnLambdaTargetFunctionName(
  targetFunctionArn: string,
): string {
  const separatorIndex = targetFunctionArn.indexOf(functionArnSeparator);

  if (separatorIndex === -1) {
    return targetFunctionArn;
  }

  const nameAndQualifier = targetFunctionArn.slice(
    separatorIndex + functionArnSeparator.length,
  );

  return nameAndQualifier.split(":", 1)[0] ?? nameAndQualifier;
}

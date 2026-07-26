const functionArnSeparator = ":function:";

/**
 * Get the function name an AWS::Lambda::Url TargetFunctionArn names.
 *
 * Templates reach this property in two ways: `Fn::GetAtt` on the function,
 * giving a full ARN, or `Ref`, giving the function name. Both are accepted,
 * as both are valid template ways to point at the same function. A version or
 * alias qualifier on the ARN is dropped, as qualified Function URLs are not
 * simulated.
 */
export function simCfnLambdaUrlFunctionName(targetFunctionArn: string): string {
  const separatorIndex = targetFunctionArn.indexOf(functionArnSeparator);

  if (separatorIndex === -1) {
    return targetFunctionArn;
  }

  const nameAndQualifier = targetFunctionArn.slice(
    separatorIndex + functionArnSeparator.length,
  );

  return nameAndQualifier.split(":", 1)[0] ?? nameAndQualifier;
}

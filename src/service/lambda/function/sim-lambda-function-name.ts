const functionArnSeparator = ":function:";

/**
 * Get the function name out of whatever names a function.
 *
 * Real Lambda accepts a name or a function ARN wherever it takes a
 * `FunctionName`, and CloudFormation templates point at a function either way
 * too: `Ref` gives the name and `Fn::GetAtt` gives the ARN. A version or alias
 * qualifier on the ARN is dropped, as qualified functions are not simulated.
 */
export function simLambdaFunctionNameOf(functionNameOrArn: string): string {
  const separatorIndex = functionNameOrArn.indexOf(functionArnSeparator);

  if (separatorIndex === -1) {
    return functionNameOrArn;
  }

  const nameAndQualifier = functionNameOrArn.slice(
    separatorIndex + functionArnSeparator.length,
  );

  return nameAndQualifier.split(":", 1)[0] ?? nameAndQualifier;
}

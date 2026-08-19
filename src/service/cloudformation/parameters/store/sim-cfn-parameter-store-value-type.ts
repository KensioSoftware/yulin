/** The Parameter type that holds a Parameter Store name. */
const parameterStoreValuePrefix = "AWS::SSM::Parameter::Value<";

/**
 * A template Parameter type that names a value in Parameter Store.
 *
 * The inner type decides the shape the stored value takes, and nothing else.
 * The value is not checked against it: a name pointing at something other than
 * an image ID resolves as the string it is, where real CloudFormation would
 * refuse the Stack.
 */
export interface SimCfnParameterStoreValueType {
  /** Whether the stored value is split into a list of strings. */
  readonly list: boolean;
}

/**
 * Read a declared Parameter `Type` as a Parameter Store value type.
 *
 * Undefined for every other type, including the `String` and
 * `CommaDelimitedList` types that hold their value in the template itself.
 */
export function simCfnParameterStoreValueType(
  declaredType: string | undefined,
): SimCfnParameterStoreValueType | undefined {
  if (
    declaredType === undefined ||
    !declaredType.startsWith(parameterStoreValuePrefix) ||
    !declaredType.endsWith(">")
  ) {
    return undefined;
  }

  const innerType = declaredType.slice(parameterStoreValuePrefix.length, -1);

  return {
    list: innerType === "CommaDelimitedList" || innerType.startsWith("List<"),
  };
}

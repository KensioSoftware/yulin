import type {
  SimCloudFormationParameterInput,
  SimCloudFormationParameterValues,
} from "./sim-cfn-parameters.type.js";

/**
 * Read the Parameter values a CloudFormation command input carries.
 *
 * AWS command inputs carry Parameters as an array of key/value objects, while
 * the Parameters wrapper keys values by Parameter name. An entry missing either
 * half is left out, having no usable runtime value to contribute.
 */
export function simCfnParameterInputValues(
  input: SimCloudFormationParameterInput,
): SimCloudFormationParameterValues {
  const values = new Map<string, string>();
  const inputParameters = input.Parameters ?? [];

  for (const parameter of inputParameters) {
    const { ParameterKey: key, ParameterValue: value } = parameter;

    if (key !== undefined && value !== undefined) {
      values.set(key, value);
    }
  }

  return Object.fromEntries(values);
}

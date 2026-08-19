import { isRecord } from "../../../util/type-guard/record.js";
import type {
  SimCfnParameterDefinition,
  SimCfnParametersContext,
} from "./sim-cfn-parameters.type.js";

/**
 * Read a template `Parameters` section into the definitions of one Stack.
 *
 * An entry that is not an object is refused by name. There is nothing a value
 * expression could read from a definition with no fields, and the template that
 * wrote one has a shape CloudFormation would refuse too.
 */
export function simCfnParameterDefinitions(
  properties: SimCfnParametersContext,
): ReadonlyMap<string, SimCfnParameterDefinition> {
  const definitions = new Map<string, SimCfnParameterDefinition>();
  const stackName = properties.stackName ?? "unknown";
  const declared = Object.entries(properties.definitions ?? {});

  for (const [parameterName, definition] of declared) {
    if (!isRecord(definition)) {
      throw new Error(
        `Sim CloudFormation Stack ${stackName} parameter ${parameterName} definition must be an object`,
      );
    }

    definitions.set(parameterName, definition);
  }

  return definitions;
}

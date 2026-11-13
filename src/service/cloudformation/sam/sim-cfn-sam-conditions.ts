import type { SimCfnConditionsSection } from "../template/condition/sim-cfn-conditions.js";
import type { SimCfnTemplateValue } from "../template/value/sim-cfn-template-value.js";
import type { SamTemplateApiAuth } from "./api/auth/sim-cfn-sam-template-api-auth.js";
import { samFunctionConditions } from "./function/sim-cfn-sam-function.js";
import { samFunctionType } from "./function/sim-cfn-sam-function-type.js";
import type { SamTemplateGlobals } from "./sim-cfn-sam-globals.js";
import { isSamTemplateRecord } from "./sim-cfn-sam-record.js";

interface SamConditionsProperties {
  readonly declared: SimCfnConditionsSection | undefined;
  readonly resources: readonly (readonly [string, SimCfnTemplateValue])[];
  readonly globals: SamTemplateGlobals;
  readonly apiAuth: SamTemplateApiAuth;
}

/**
 * The template's `Conditions` with the ones its SAM functions add, or nothing
 * to change where they add none.
 */
export function samConditions(properties: SamConditionsProperties): {
  Conditions?: SimCfnConditionsSection;
} {
  const { globals, apiAuth } = properties;
  const added = properties.resources.flatMap(([logicalId, resource]) =>
    isSamTemplateRecord(resource) && resource["Type"] === samFunctionType
      ? Object.entries(
          samFunctionConditions({ logicalId, resource, globals, apiAuth }),
        )
      : [],
  );

  return added.length === 0
    ? {}
    : {
        Conditions: { ...properties.declared, ...Object.fromEntries(added) },
      };
}

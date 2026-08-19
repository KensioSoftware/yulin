import type { CfnTemplateBodyRecord } from "../template/sim-cfn-template.js";
import type { SimCfnTemplateValueRecord } from "../template/value/sim-cfn-template-value.js";
import { isSamTemplateRecord } from "./sim-cfn-sam-record.js";

/**
 * The `Globals.Function` defaults a template states. A template carrying no
 * `Globals` section states none.
 */
export function samFunctionGlobals(
  template: CfnTemplateBodyRecord,
): SimCfnTemplateValueRecord {
  const globals = template["Globals"];

  if (!isSamTemplateRecord(globals)) {
    return {};
  }

  const functionGlobals = globals["Function"];

  return isSamTemplateRecord(functionGlobals) ? functionGlobals : {};
}

/**
 * The properties a function is expanded with, from the `Globals.Function`
 * defaults and what the function states for itself.
 *
 * A property the function states wins outright, apart from the environment
 * variables, which are merged key by key so a function adding one of its own
 * still gets the ones every function is given.
 */
export function samMergedFunctionProperties(
  globals: SimCfnTemplateValueRecord,
  properties: SimCfnTemplateValueRecord,
): SimCfnTemplateValueRecord {
  return {
    ...globals,
    ...properties,
    ...mergedEnvironment(globals["Environment"], properties["Environment"]),
  };
}

/**
 * The `Environment` of a function that states one over a default that states
 * one too. Either side missing leaves the other where the merge above put it.
 */
function mergedEnvironment(
  globalEnvironment: unknown,
  ownEnvironment: unknown,
): SimCfnTemplateValueRecord {
  if (
    !isSamTemplateRecord(globalEnvironment) ||
    !isSamTemplateRecord(ownEnvironment)
  ) {
    return {};
  }

  return {
    Environment: {
      ...globalEnvironment,
      ...ownEnvironment,
      Variables: {
        ...environmentVariables(globalEnvironment),
        ...environmentVariables(ownEnvironment),
      },
    },
  };
}

/**
 * The `Variables` an environment holds, as a record to merge.
 */
function environmentVariables(
  environment: SimCfnTemplateValueRecord,
): SimCfnTemplateValueRecord {
  const variables = environment["Variables"];

  return isSamTemplateRecord(variables) ? variables : {};
}

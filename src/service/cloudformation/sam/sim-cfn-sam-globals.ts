import type { CfnTemplateBodyRecord } from "../template/sim-cfn-template.js";
import type { SimCfnTemplateValueRecord } from "../template/value/sim-cfn-template-value.js";
import { isSamTemplateRecord } from "./sim-cfn-sam-record.js";

/**
 * The `Globals` defaults a template states, by the SAM Resource type each
 * section supplies them to.
 */
export interface SamTemplateGlobals {
  /** The `Globals.Function` defaults every SAM function takes. */
  readonly forFunction: SimCfnTemplateValueRecord;
  /** The `Globals.HttpApi` defaults every SAM HTTP API takes. */
  readonly forHttpApi: SimCfnTemplateValueRecord;
}

/**
 * The `Globals` defaults a template states. A template carrying no `Globals`
 * section states none.
 */
export function samTemplateGlobals(
  template: CfnTemplateBodyRecord,
): SamTemplateGlobals {
  const globals = template["Globals"];

  if (!isSamTemplateRecord(globals)) {
    return { forFunction: {}, forHttpApi: {} };
  }

  return {
    forFunction: samGlobalsSection(globals["Function"]),
    forHttpApi: samGlobalsSection(globals["HttpApi"]),
  };
}

/**
 * One section of the `Globals` a template states. A template stating a section
 * in some other shape states no defaults.
 */
function samGlobalsSection(section: unknown): SimCfnTemplateValueRecord {
  return isSamTemplateRecord(section) ? section : {};
}

/**
 * The properties an HTTP API is expanded with, from the `Globals.HttpApi`
 * defaults and what the API states for itself.
 *
 * A property the API states wins outright. Nothing here is merged the way a
 * function's environment variables are, because none of what an HTTP API takes
 * from `Globals` is a set of named entries a second declaration adds to.
 */
export function samMergedHttpApiProperties(
  globals: SimCfnTemplateValueRecord,
  properties: SimCfnTemplateValueRecord,
): SimCfnTemplateValueRecord {
  return { ...globals, ...properties };
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

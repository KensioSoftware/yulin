import type { CfnTemplateBodyRecord } from "../../../template/sim-cfn-template.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import { samImplicitHttpApiLogicalId } from "../../function/event/sim-cfn-sam-implicit-http-api.js";
import { samImplicitRestApiLogicalId } from "../../function/event/sim-cfn-sam-implicit-rest-api.js";
import { samResourceProperties } from "../../function/sim-cfn-sam-function-properties.js";
import type { SamTemplateGlobals } from "../../sim-cfn-sam-globals.js";
import { samMergedApiProperties } from "../../sim-cfn-sam-globals.js";
import { isSamTemplateRecord } from "../../sim-cfn-sam-record.js";
import { samHttpApiType } from "../sim-cfn-sam-http-api.js";
import { samRestApiType } from "../sim-cfn-sam-rest-api.js";
import type { SamApiAuth } from "./sim-cfn-sam-api-auth.types.js";
import { samHttpApiAuth } from "./sim-cfn-sam-http-api-auth.js";
import { samRestApiAuth } from "./sim-cfn-sam-rest-api-auth.js";

/**
 * The `Auth` of every API of a template, by the logical ID the API is expanded
 * under.
 *
 * An `Api` or `HttpApi` event puts its method on an API declared somewhere
 * else in the template, and has to know what that API's `Auth` block declared
 * before it can name one of its authorizers. This is read once for the whole
 * template and handed to every event.
 */
export type SamTemplateApiAuth = ReadonlyMap<string, SamApiAuth>;

/**
 * Read the `Auth` of every API a template declares, and of the two implicit
 * APIs its events may make.
 *
 * The implicit APIs are read from `Globals`, which is where SAM says their
 * `Auth` comes from. An API the template declares under one of their logical
 * IDs is the API of that name, and is read last for that reason.
 *
 * An API naming a `DefinitionUri` is left out. Nothing here reads the document
 * it points at, so the API is not expanded at all and there is no authorizer
 * Resource for a method to name.
 */
export function samTemplateApiAuth(
  template: CfnTemplateBodyRecord,
  globals: SamTemplateGlobals,
): SamTemplateApiAuth {
  const resources = isSamTemplateRecord(template.Resources)
    ? Object.entries(template.Resources)
    : [];

  return new Map([
    [
      samImplicitRestApiLogicalId,
      samRestApiAuth(samImplicitRestApiLogicalId, globals.forApi),
    ],
    [
      samImplicitHttpApiLogicalId,
      samHttpApiAuth(samImplicitHttpApiLogicalId, globals.forHttpApi),
    ],
    ...resources.flatMap(([logicalId, resource]) =>
      declaredApiAuth(logicalId, resource, globals),
    ),
  ]);
}

/**
 * The `Auth` of one Resource of the template, where the Resource is a SAM API
 * this expansion covers.
 */
function declaredApiAuth(
  logicalId: string,
  resource: SimCfnTemplateValue,
  globals: SamTemplateGlobals,
): readonly (readonly [string, SamApiAuth])[] {
  if (!isSamTemplateRecord(resource)) {
    return [];
  }

  const type = resource["Type"];

  if (type === samRestApiType) {
    return apiAuth(logicalId, resource, globals.forApi, samRestApiAuth);
  }

  if (type === samHttpApiType) {
    return apiAuth(logicalId, resource, globals.forHttpApi, samHttpApiAuth);
  }

  return [];
}

function apiAuth(
  logicalId: string,
  resource: Record<string, SimCfnTemplateValue>,
  globals: Record<string, SimCfnTemplateValue>,
  read: (
    logicalId: string,
    apiProperties: Record<string, SimCfnTemplateValue>,
  ) => SamApiAuth,
): readonly (readonly [string, SamApiAuth])[] {
  const apiProperties = samMergedApiProperties(
    globals,
    samResourceProperties(resource),
  );

  if (apiProperties["DefinitionUri"] !== undefined) {
    return [];
  }

  return [[logicalId, read(logicalId, apiProperties)] as const];
}

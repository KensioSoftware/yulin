import { isRecord } from "../../../util/type-guard/record.js";
import type { CfnTemplateBodyRecord } from "../template/sim-cfn-template.js";
import type { SimCfnTemplateValue } from "../template/value/sim-cfn-template-value.js";
import {
  samHttpApiResources,
  samHttpApiType,
} from "./api/sim-cfn-sam-http-api.js";
import {
  samFunctionResources,
  samFunctionType,
} from "./function/sim-cfn-sam-function.js";
import {
  samSimpleTableResources,
  samSimpleTableType,
} from "./table/sim-cfn-sam-simple-table.js";
import type { SamTemplateGlobals } from "./sim-cfn-sam-globals.js";
import { samTemplateGlobals } from "./sim-cfn-sam-globals.js";
import { isSamTemplateRecord } from "./sim-cfn-sam-record.js";
import {
  templateNamesSamTransform,
  withoutSamSections,
} from "./sim-cfn-sam-transform.js";

/**
 * Expand the SAM Resources of a template into the Resource types simulated AWS
 * creates.
 *
 * This is what CloudFormation does with a template naming the SAM transform.
 * It runs ahead of everything that reads the template, and a Stack is deployed
 * from a body holding no `AWS::Serverless::*` Resource left to interpret. A
 * template naming no SAM transform is returned as it came, and so is one this
 * cannot read at all, leaving the body validation to say what is wrong with it.
 *
 * The expansion is a subset. AWS runs the real one in `aws-sam-translator`, a
 * Python library with no JavaScript equivalent, and what is written here covers
 * the SAM Resources Yulin models. A SAM Resource type outside it stays where it
 * is and is recorded as unsupported, the same as before.
 */
export function samExpandedTemplate(
  template: CfnTemplateBodyRecord,
): CfnTemplateBodyRecord {
  if (!isRecord(template) || !isRecord(template.Resources)) {
    return template;
  }

  if (!templateNamesSamTransform(template)) {
    return template;
  }

  const globals = samTemplateGlobals(template);

  return {
    ...withoutSamSections(template),
    Resources: Object.fromEntries(
      Object.entries(template.Resources).flatMap(([logicalId, resource]) =>
        Object.entries(expandedResource(logicalId, resource, globals)),
      ),
    ),
  };
}

/**
 * The Resources one template Resource is deployed as. Anything the expansion
 * does not cover is deployed as itself.
 */
function expandedResource(
  logicalId: string,
  resource: SimCfnTemplateValue,
  globals: SamTemplateGlobals,
): Record<string, SimCfnTemplateValue> {
  if (!isSamTemplateRecord(resource)) {
    return { [logicalId]: resource };
  }

  const type = resource["Type"];

  if (type === samFunctionType) {
    return samFunctionResources({
      logicalId,
      resource,
      globals: globals.forFunction,
    });
  }

  if (type === samHttpApiType) {
    return samHttpApiResources({
      logicalId,
      resource,
      globals: globals.forHttpApi,
    });
  }

  if (type === samSimpleTableType) {
    return samSimpleTableResources({ logicalId, resource });
  }

  return { [logicalId]: resource };
}

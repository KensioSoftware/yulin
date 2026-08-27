import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValue } from "../../cloudformation/template/value/sim-cfn-template-value.js";

/**
 * The simulated object created for a REST API part Resource.
 */
export function simCfnRestApiPart<T extends object>(
  resource: SimCfnResource,
): T {
  const part = resource.simResource as T | undefined;

  /* v8 ignore if -- a Resource that was never created is not deleted */
  if (part === undefined) {
    throw new TypeError(
      `sim REST API part for CloudFormation Resource ${resource.logicalId} is missing`,
    );
  }

  return part;
}

/**
 * A string a REST API part Resource has to carry to be addressed again.
 */
export function simCfnRestApiPartProperty(
  resource: SimCfnResource,
  value: SimCfnTemplateValue | undefined,
  name: string,
): string {
  /* v8 ignore if -- creation refused the Resource without this string */
  if (typeof value !== "string") {
    throw new TypeError(
      `AWS::ApiGateway Resource ${resource.logicalId} requires a ${name} string to delete`,
    );
  }

  return value;
}

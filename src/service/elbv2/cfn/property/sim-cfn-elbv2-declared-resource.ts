import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";

/**
 * One ELBv2 Resource of a template, and the properties it declared.
 *
 * The two travel together everywhere in here: the properties are what is read,
 * and the Resource is what a refusal names and what an ignored property is
 * recorded against.
 */
export interface SimCfnElbV2DeclaredResource {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

import type { SimCfnParameters } from "../../parameters/sim-cfn-parameters.js";
import type { SimCfnResourceRefResolver as SimCfnResourceReferenceResolver } from "./sim-cfn-resource-ref-resolver.js";
import type { SimCfnPseudoParameters } from "../../parameters/pseudo/sim-cfn-pseudo-parameters.js";
import type { SimCfnMappings } from "../mapping/sim-cfn-mappings.js";
import type { SimCfnConditions } from "../condition/sim-cfn-conditions.js";

interface SimCfnResolveContextProperties {
  readonly parameters: SimCfnParameters;
  readonly resources?: SimCfnResourceReferenceResolver | undefined;
  readonly pseudoParameters?: SimCfnPseudoParameters | undefined;
  readonly mappings?: SimCfnMappings | undefined;
  readonly conditions?: SimCfnConditions | undefined;
}

/**
 * Context available while resolving a parsed CloudFormation node tree.
 */
export class SimCfnResolveContext {
  public readonly parameters: SimCfnParameters;
  public readonly resources: SimCfnResourceReferenceResolver | undefined;
  public readonly pseudoParameters: SimCfnPseudoParameters | undefined;
  public readonly mappings: SimCfnMappings | undefined;
  public readonly conditions: SimCfnConditions | undefined;

  constructor(properties: SimCfnResolveContextProperties) {
    this.parameters = properties.parameters;
    this.resources = properties.resources;
    this.pseudoParameters = properties.pseudoParameters;
    this.mappings = properties.mappings;
    this.conditions = properties.conditions;
  }
}

import type { SimCfnParameters } from "../../parameters/sim-cfn-parameters.js";
import type { SimCfnResourceRefResolver as SimCfnResourceReferenceResolver } from "./sim-cfn-resource-ref-resolver.js";
import type { SimCfnPseudoParameters } from "../../parameters/pseudo/sim-cfn-pseudo-parameters.js";
import type { SimCfnMappings } from "../mapping/sim-cfn-mappings.js";
import type { SimCfnConditions } from "../condition/sim-cfn-conditions.js";
import { SimCfnExports } from "../../export/sim-cfn-exports.js";
import type { SimCfnDynamicReferences } from "../dynamic/sim-cfn-dynamic-references.js";

interface SimCfnResolveContextProperties {
  readonly parameters: SimCfnParameters;
  readonly resources?: SimCfnResourceReferenceResolver | undefined;
  readonly pseudoParameters?: SimCfnPseudoParameters | undefined;
  readonly mappings?: SimCfnMappings | undefined;
  readonly conditions?: SimCfnConditions | undefined;
  readonly exports?: SimCfnExports | undefined;
  readonly dynamicReferences?: SimCfnDynamicReferences | undefined;
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
  /**
   * The export names a Stack deployed here can import.
   *
   * An empty set stands in where a caller resolves a template outside a
   * simulation. An `Fn::ImportValue` there fails the lookup and is refused by
   * export name.
   */
  public readonly exports: SimCfnExports;

  /**
   * The services answering `{{resolve:...}}` references in resolved strings.
   *
   * Absent on the template-wide pass, which runs before any Resource exists
   * and so before a reference could be read as the Stack would read it.
   */
  public readonly dynamicReferences: SimCfnDynamicReferences | undefined;

  constructor(properties: SimCfnResolveContextProperties) {
    this.parameters = properties.parameters;
    this.resources = properties.resources;
    this.pseudoParameters = properties.pseudoParameters;
    this.mappings = properties.mappings;
    this.conditions = properties.conditions;
    this.exports = properties.exports ?? new SimCfnExports();
    this.dynamicReferences = properties.dynamicReferences;
  }
}

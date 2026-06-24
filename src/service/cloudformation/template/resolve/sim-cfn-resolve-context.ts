import type { SimCfnParameters } from "../../parameters/sim-cfn-parameters.js";
import type { SimCfnResourceRefResolver } from "./sim-cfn-resource-ref-resolver.js";
import type { SimCfnPseudoParameters } from "../../parameters/pseudo/sim-cfn-pseudo-parameters.js";

/**
 * Context available while resolving a parsed CloudFormation node tree.
 */
export class SimCfnResolveContext {
  constructor(
    readonly parameters: SimCfnParameters,
    readonly resources?: SimCfnResourceRefResolver | undefined,
    readonly pseudoParameters?: SimCfnPseudoParameters | undefined,
  ) {}
}

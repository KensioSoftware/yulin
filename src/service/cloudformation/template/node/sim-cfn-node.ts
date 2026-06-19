import type { SimCfnParameters } from "../../parameters/sim-cfn-parameters.js";
import type { SimCfnTemplateValue } from "../value/sim-cfn-template-value.js";

/**
 * Context available while resolving a parsed CloudFormation node tree.
 */
export class SimCfnResolveContext {
  constructor(readonly parameters: SimCfnParameters) {}
}

/**
 * A parsed CloudFormation template value.
 *
 * Parsing happens once, up front, so that every node is a concrete class with
 * already-validated children. Resolution is then plain polymorphism with no
 * further runtime shape checks.
 */
export abstract class SimCfnNode {
  /**
   * Resolve this node to a concrete template value.
   */
  abstract resolve(context: SimCfnResolveContext): SimCfnTemplateValue;
}

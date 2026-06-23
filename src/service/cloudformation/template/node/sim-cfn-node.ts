import type { SimCfnParameters } from "../../parameters/sim-cfn-parameters.js";
import type { SimCfnTemplateValue } from "../value/sim-cfn-template-value.js";
import type { SimCfnResourceRefResolver } from "../resolve/sim-cfn-resource-ref-resolver.js";
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

  /**
   * Logical names referenced via Ref anywhere in this node subtree.
   *
   * This is used to discover implicit dependencies between Resources. Container
   * nodes forward to their children; leaf nodes contribute nothing unless they
   * are a Ref.
   */
  referencedNames(): string[] {
    return [];
  }
}

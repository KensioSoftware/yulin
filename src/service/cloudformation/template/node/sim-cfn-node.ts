import type { SimCfnTemplateValue } from "../value/sim-cfn-template-value.js";
import type { SimCfnResolveContext } from "../resolve/sim-cfn-resolve-context.js";

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

import { SimCfnNode } from "./sim-cfn-node.js";
import type { SimCfnTemplateValueRecord } from "../value/sim-cfn-template-value.js";
import type { SimCfnResolveContext } from "../resolve/sim-cfn-resolve-context.js";

/**
 * A plain CloudFormation template object (one that is not an intrinsic function).
 */
export class SimCfnObject extends SimCfnNode {
  constructor(private readonly entries: ReadonlyMap<string, SimCfnNode>) {
    super();
  }

  /**
   * Resolve each property value in the object.
   */
  resolve(context: SimCfnResolveContext): SimCfnTemplateValueRecord {
    return Object.fromEntries(
      [...this.entries].map(([key, node]) => [key, node.resolve(context)]),
    );
  }

  /**
   * Collect referenced names from every property value.
   */
  override referencedNames(): string[] {
    return this.entries
      .values()
      .flatMap((node) => node.referencedNames())
      .toArray();
  }
}

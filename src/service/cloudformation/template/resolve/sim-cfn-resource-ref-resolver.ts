import type { SimCfnTemplateValue } from "../value/sim-cfn-template-value.js";

/**
 * Resolves a `{ "Ref": "LogicalId" }` to another Resource's Ref value.
 *
 * This is only available once Resources exist at creation time. During the
 * up-front template resolution pass it is omitted, so Resource Refs are left
 * unresolved until the referenced Resource has been created.
 */
export interface SimCfnResourceRefResolver {
  /**
   * Whether a Resource with this logical ID exists in the Stack.
   */
  has(logicalId: string): boolean;

  /**
   * The value the referenced Resource returns for Ref.
   */
  refValue(logicalId: string): SimCfnTemplateValue;
}

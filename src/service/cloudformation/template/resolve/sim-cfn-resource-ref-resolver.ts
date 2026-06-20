import type { SimCfnTemplateValue } from "../value/sim-cfn-template-value.js";

/**
 * Resolves Resource-backed intrinsic functions such as `{ "Ref": "LogicalId" }`
 * and `{ "Fn::GetAtt": ["LogicalId", "AttributeName"] }`.
 *
 * This is only available once Resources exist at creation time. During the
 * up-front template resolution pass it is omitted, so Resource intrinsics are
 * left unresolved until the referenced Resource has been created.
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

  /**
   * The value the referenced Resource returns for Fn::GetAtt.
   */
  attributeValue(logicalId: string, attributeName: string): SimCfnTemplateValue;
}

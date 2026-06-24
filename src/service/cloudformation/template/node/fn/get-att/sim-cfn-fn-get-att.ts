import { SimCfnNode } from "../../sim-cfn-node.js";
import type { SimCfnTemplateValue } from "../../../value/sim-cfn-template-value.js";
import type { SimCfnResolveContext } from "../../../resolve/sim-cfn-resolve-context.js";

/**
 * A CloudFormation `{ "Fn::GetAtt": ["LogicalId", "AttributeName"] }`
 * expression.
 */
export class SimCfnGetAtt extends SimCfnNode {
  constructor(
    private readonly logicalId: string,
    private readonly attributeName: string,
  ) {
    super();
  }

  /**
   * Resolve the Resource attribute.
   *
   * Resource attributes can only resolve once the referenced Resource has been
   * created. During the up-front pass before Resources exist, the GetAtt is
   * preserved unresolved for a later Resource-creation pass.
   */
  resolve(context: SimCfnResolveContext): SimCfnTemplateValue {
    if (context.resources?.has(this.logicalId) === true) {
      return context.resources.attributeValue(
        this.logicalId,
        this.attributeName,
      );
    }

    return { "Fn::GetAtt": [this.logicalId, this.attributeName] };
  }

  /**
   * Expose the referenced Resource logical ID for implicit dependency discovery.
   */
  override referencedNames(): string[] {
    return [this.logicalId];
  }
}

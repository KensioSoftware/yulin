import type { SimCfnNode } from "../../../sim-cfn-node.js";
import type { SimCfnTemplateValue } from "../../../../value/sim-cfn-template-value.js";
import { assertDefined } from "../../../../../../../util/type-guard/defined.js";

interface SimCfnFnSubUnresolvedValueProps {
  readonly template: string;
  readonly variables: ReadonlyMap<string, SimCfnNode>;
}

/**
 * Rebuilds an unresolved CloudFormation `Fn::Sub` template value.
 */
export class SimCfnFnSubUnresolvedValue {
  private readonly template: string;
  private readonly variables: ReadonlyMap<string, SimCfnNode>;

  constructor(props: SimCfnFnSubUnresolvedValueProps) {
    this.template = props.template;
    this.variables = props.variables;
  }

  /**
   * Re-emit the original Fn::Sub expression with any explicit variables resolved
   * as far as possible.
   */
  toTemplateValue(
    resolvedVariables: ReadonlyMap<string, SimCfnTemplateValue>,
  ): SimCfnTemplateValue {
    if (this.variables.size === 0) {
      return { "Fn::Sub": this.template };
    }

    return {
      "Fn::Sub": [
        this.template,
        Object.fromEntries(
          [...this.variables.keys()].map((name) => [
            name,
            this.requiredResolvedVariable(name, resolvedVariables),
          ]),
        ),
      ],
    };
  }

  private requiredResolvedVariable(
    name: string,
    resolvedVariables: ReadonlyMap<string, SimCfnTemplateValue>,
  ): SimCfnTemplateValue {
    const resolved = resolvedVariables.get(name);
    assertDefined(
      resolved,
      `Sim CloudFormation Fn::Sub variable ${name} was not resolved`,
    );

    return resolved;
  }
}

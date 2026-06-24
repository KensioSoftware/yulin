import { SimCfnNode } from "../../sim-cfn-node.js";
import type { SimCfnTemplateValue } from "../../../value/sim-cfn-template-value.js";
import { SimCfnFnSubTemplate } from "./template/sim-cfn-fn-sub-template.js";
import { SimCfnFnSubVariableResolver } from "./resolve/sim-cfn-fn-sub-variable-resolver.js";
import type { SimCfnResolveContext } from "../../../resolve/sim-cfn-resolve-context.js";

/**
 * Simulated CloudFormation `Fn::Sub` intrinsic function.
 *
 * Supported shapes:
 *
 * {
 *   "Fn::Sub": "arn:aws:s3:::${BucketName}"
 * }
 *
 * {
 *   "Fn::Sub": ["${Prefix}-${Name}", { "Prefix": "my", "Name": { "Ref": "Env" } }]
 * }
 */
export class SimCfnFnSub extends SimCfnNode {
  private readonly subTemplate: SimCfnFnSubTemplate;
  private readonly variableResolver: SimCfnFnSubVariableResolver;

  constructor(
    private readonly template: string,
    private readonly variables: ReadonlyMap<string, SimCfnNode> = new Map(),
  ) {
    super();

    this.subTemplate = new SimCfnFnSubTemplate(template);
    this.variableResolver = new SimCfnFnSubVariableResolver(variables);
  }

  /**
   * Resolve every substitution variable and replace it in the template string.
   *
   * If a referenced value is still unresolved, this node re-emits itself in
   * template form so a later Resource resolution pass can finish it.
   */
  resolve(context: SimCfnResolveContext): SimCfnTemplateValue {
    const resolvedVariables = this.variableResolver.resolveAll(
      this.subTemplate.variableNames(),
      context,
    );

    // Resource Refs/GetAtts can be unresolved during the initial template pass,
    // before Resources have been created. Preserve the Fn::Sub expression so
    // the later Resource-creation resolution pass can substitute the final
    // string.
    if (
      [...resolvedVariables.values()].some((value) => typeof value !== "string")
    ) {
      return this.unresolvedTemplateValue(resolvedVariables);
    }

    return this.subTemplate.substitute(
      this.variableResolver.stringVariables(resolvedVariables),
    );
  }

  /**
   * Collect referenced names from explicit variable values and implicit
   * substitution references.
   */
  override referencedNames(): string[] {
    return [
      ...[...this.variables.values()].flatMap((value) =>
        value.referencedNames(),
      ),
      ...this.subTemplate
        .variableNames()
        .filter((variableName) => !this.variables.has(variableName))
        .map((variableName) => variableName.split(".")[0] ?? variableName),
    ];
  }

  private unresolvedTemplateValue(
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

    if (resolved === undefined) {
      throw new Error(
        `Sim CloudFormation Fn::Sub variable ${name} was not resolved`,
      );
    }

    return resolved;
  }
}

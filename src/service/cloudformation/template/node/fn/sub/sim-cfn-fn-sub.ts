import { SimCfnNode, type SimCfnResolveContext } from "../../sim-cfn-node.js";
import { SimCfnGetAtt } from "../get-att/sim-cfn-fn-get-att.js";
import type { SimCfnTemplateValue } from "../../../value/sim-cfn-template-value.js";
import { SimCfnRef } from "../../sim-cfn-ref.js";
import { assertDefined } from "../../../../../../util/type-guard/defined.js";
import { SimCfnFnSubTemplate } from "./template/sim-cfn-fn-sub-template.js";

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

  constructor(
    private readonly template: string,
    private readonly variables: ReadonlyMap<string, SimCfnNode> = new Map(),
  ) {
    super();

    this.subTemplate = new SimCfnFnSubTemplate(template);
  }

  /**
   * Resolve every substitution variable and replace it in the template string.
   *
   * If a referenced value is still unresolved, this node re-emits itself in
   * template form so a later Resource resolution pass can finish it.
   */
  resolve(context: SimCfnResolveContext): SimCfnTemplateValue {
    const resolvedVariables = new Map<string, SimCfnTemplateValue>();

    for (const variableName of this.subTemplate.variableNames()) {
      const resolved = this.resolveVariable(variableName, context);

      if (
        typeof resolved !== "string" &&
        !this.isDeferredExpression(resolved)
      ) {
        throw new TypeError(
          `Sim CloudFormation Fn::Sub variable ${variableName} must resolve to a string, got ${typeof resolved}`,
        );
      }

      resolvedVariables.set(variableName, resolved);
    }

    // Resource Refs/GetAtts can be unresolved during the initial template pass,
    // before Resources have been created. Preserve the Fn::Sub expression so
    // the later Resource-creation resolution pass can substitute the final
    // string.
    if (
      [...resolvedVariables.values()].some((value) => typeof value !== "string")
    ) {
      return this.unresolvedTemplateValue(resolvedVariables);
    }

    return this.subTemplate.substitute(this.stringVariables(resolvedVariables));
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
        .logicalNames()
        .filter((name) => !this.variables.has(name)),
    ];
  }

  private resolveVariable(
    variableName: string,
    context: SimCfnResolveContext,
  ): SimCfnTemplateValue {
    const explicitVariable = this.variables.get(variableName);

    if (explicitVariable !== undefined) {
      return explicitVariable.resolve(context);
    }

    if (variableName.includes(".")) {
      const [logicalId, ...attributeParts] = variableName.split(".");
      assertDefined(
        logicalId,
        `Logical ID in CFN Fn::Sub variable ${variableName}`,
      );
      const attributeName = attributeParts.join(".");

      return new SimCfnGetAtt(logicalId, attributeName).resolve(context);
    }

    return new SimCfnRef(variableName).resolve(context);
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

  private stringVariables(
    resolvedVariables: ReadonlyMap<string, SimCfnTemplateValue>,
  ): ReadonlyMap<string, string> {
    return new Map(
      [...resolvedVariables].map(([name, value]) => {
        /* v8 ignore if -- unreachable defensive check */
        if (typeof value !== "string") {
          throw new TypeError(
            `Sim CloudFormation Fn::Sub variable ${name} must resolve to a string, got ${typeof value}`,
          );
        }

        return [name, value];
      }),
    );
  }

  /**
   * Whether a resolved value is still an unresolved intrinsic expression.
   */
  private isDeferredExpression(value: SimCfnTemplateValue): boolean {
    return typeof value === "object" && value !== null;
  }
}

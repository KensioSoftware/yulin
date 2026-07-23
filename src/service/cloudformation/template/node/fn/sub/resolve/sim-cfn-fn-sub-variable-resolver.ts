import type { SimCfnNode } from "../../../sim-cfn-node.js";
import type { SimCfnTemplateValue } from "../../../../value/sim-cfn-template-value.js";
import { assertDefined } from "../../../../../../../util/type-guard/defined.js";
import { SimCfnGetAtt } from "../../get-att/sim-cfn-fn-get-att.js";
import { SimCfnRef as SimCfnReference } from "../../../sim-cfn-ref.js";
import type { SimCfnResolveContext } from "../../../../resolve/sim-cfn-resolve-context.js";

/**
 * Resolves Fn::Sub variables from explicit overrides or implicit Ref/GetAtt
 * expressions.
 */
export class SimCfnFnSubVariableResolver {
  constructor(private readonly variables: ReadonlyMap<string, SimCfnNode>) {}

  /**
   * Resolve all variable names used by a Fn::Sub template.
   */
  resolveAll(
    variableNames: readonly string[],
    context: SimCfnResolveContext,
  ): ReadonlyMap<string, SimCfnTemplateValue> {
    return new Map(
      variableNames.map((variableName) => [
        variableName,
        this.resolveRequiredStringOrDeferred(variableName, context),
      ]),
    );
  }

  /**
   * Convert resolved variables to string variables after deferred expressions
   * have already been ruled out.
   */
  stringVariables(
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

  private resolveRequiredStringOrDeferred(
    variableName: string,
    context: SimCfnResolveContext,
  ): SimCfnTemplateValue {
    const resolved = this.resolveVariable(variableName, context);

    if (typeof resolved !== "string" && !this.isDeferredExpression(resolved)) {
      throw new TypeError(
        `Sim CloudFormation Fn::Sub variable ${variableName} must resolve to a string, got ${typeof resolved}`,
      );
    }

    return resolved;
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

      if (logicalId === "") {
        throw new Error(
          `Logical ID in CFN Fn::Sub variable ${variableName} must be non-empty`,
        );
      }

      const cfnGetAtt = new SimCfnGetAtt(logicalId, attributeParts.join("."));
      return cfnGetAtt.resolve(context);
    }

    const cfnReference = new SimCfnReference(variableName);
    return cfnReference.resolve(context);
  }

  /**
   * Whether a resolved value is still an unresolved intrinsic expression.
   */
  private isDeferredExpression(value: SimCfnTemplateValue): boolean {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return false;
    }

    const keys = Object.keys(value);

    return keys.includes("Ref") || keys.some((key) => key.startsWith("Fn::"));
  }
}

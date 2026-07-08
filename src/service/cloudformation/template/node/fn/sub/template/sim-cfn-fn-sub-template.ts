import { assertDefined } from "../../../../../../../util/type-guard/defined.js";

/**
 * Template-string helper for CloudFormation Fn::Sub.
 *
 * Owns the `${Name}` syntax details so the Fn::Sub node can focus on resolving
 * CloudFormation values.
 */
export class SimCfnFnSubTemplate {
  private static readonly variablePattern = /\${(!?)([\w.:]+)}/g;

  constructor(private readonly template: string) {}

  /**
   * Return non-escaped substitution variable names from this template.
   */
  variableNames(): string[] {
    return [
      ...new Set(
        [...this.template.matchAll(SimCfnFnSubTemplate.variablePattern)]
          .filter((match) => match[1] !== "!")
          .map((match) => match[2])
          .filter((name): name is string => name !== undefined),
      ),
    ];
  }

  /**
   * Replace substitution variables with already-resolved string values.
   */
  substitute(variables: ReadonlyMap<string, string>): string {
    return this.template.replace(
      SimCfnFnSubTemplate.variablePattern,
      (_match, escaped: string, variableName: string): string => {
        if (escaped === "!") {
          return `\${${variableName}}`;
        }

        const resolved = variables.get(variableName);
        assertDefined(
          resolved,
          `Sim CloudFormation Fn::Sub variable ${variableName} was not resolved`,
        );

        return resolved;
      },
    );
  }

  /**
   * Convert Fn::Sub variable names to referenced CloudFormation logical names.
   */
  logicalNames(): string[] {
    return this.variableNames().map((name) => this.logicalName(name));
  }

  private logicalName(variableName: string): string {
    return variableName.split(".", 1)[0] ?? variableName;
  }
}

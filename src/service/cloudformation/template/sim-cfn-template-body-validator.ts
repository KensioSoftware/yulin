import { isRecord } from "../../../util/type-guard/record.js";
import type { CfnTemplateBodyRecord } from "./sim-cfn-template.js";

interface SimCfnTemplateBodyValidatorProperties {
  readonly template: CfnTemplateBodyRecord;
  readonly stackName?: string | undefined;
}

/**
 * Validates the shape of a parsed CloudFormation template body.
 *
 * This keeps the structural checks (and their error messages) out of
 * SimCfnTemplate, which is concerned with interpreting an already-valid body.
 */
export class SimCfnTemplateBodyValidator {
  private readonly template: CfnTemplateBodyRecord;
  private readonly stackName: string | undefined;

  constructor(properties: SimCfnTemplateBodyValidatorProperties) {
    this.template = properties.template;
    this.stackName = properties.stackName;
  }

  /**
   * Throw a descriptive error if the template body is not a well-formed object.
   */
  validate(): void {
    if (!isRecord(this.template)) {
      throw this.error("TemplateBody must parse to an object");
    }

    if (!("Resources" in this.template)) {
      throw this.error("TemplateBody must include a Resources object");
    }

    if (!isRecord(this.template.Resources)) {
      throw this.error("TemplateBody Resources must be an object");
    }

    if (
      this.template.Parameters !== undefined &&
      !isRecord(this.template.Parameters)
    ) {
      throw this.error("Parameters must be an object");
    }

    if (
      this.template.Conditions !== undefined &&
      !isRecord(this.template.Conditions)
    ) {
      throw this.error("Conditions must be an object");
    }
  }

  private error(detail: string): Error {
    return new Error(
      `Sim CloudFormation Stack ${this.stackName ?? "unknown"} ${detail}`,
    );
  }
}

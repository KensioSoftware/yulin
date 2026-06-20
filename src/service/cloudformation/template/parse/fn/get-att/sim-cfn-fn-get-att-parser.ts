import { SimCfnGetAtt } from "../../../node/fn/get-att/sim-cfn-fn-get-att.js";
import type { SimCfnTemplateValue } from "../../../value/sim-cfn-template-value.js";

/**
 * Parses CloudFormation Fn::GetAtt values.
 *
 * The simulator supports both standard CloudFormation forms:
 *
 * {
 *   "Fn::GetAtt": ["LogicalId", "AttributeName"]
 * }
 *
 * and:
 *
 * {
 *   "Fn::GetAtt": "LogicalId.AttributeName"
 * }
 *
 * Fn::GetAtt does not need recursive child parsing because both supported forms
 * resolve directly to a Resource logical ID and an attribute name.
 */
export class SimCfnFnGetAttParser {
  /**
   * Parse and validate the value inside a Fn::GetAtt expression.
   */
  parse(value: SimCfnTemplateValue): SimCfnGetAtt {
    if (Array.isArray(value)) {
      return this.parseArray(value);
    }

    if (typeof value === "string") {
      return this.parseString(value);
    }

    throw new TypeError(
      "Sim CloudFormation Fn::GetAtt value must be [logicalId, attributeName] or LogicalId.AttributeName",
    );
  }

  private parseArray(value: readonly SimCfnTemplateValue[]): SimCfnGetAtt {
    if (value.length !== 2) {
      throw new Error(
        "Sim CloudFormation Fn::GetAtt array value must be [logicalId, attributeName]",
      );
    }

    const [logicalId, attributeName] = value;

    if (typeof logicalId !== "string" || typeof attributeName !== "string") {
      throw new TypeError(
        "Sim CloudFormation Fn::GetAtt array values must be strings",
      );
    }

    return new SimCfnGetAtt(logicalId, attributeName);
  }

  private parseString(value: string): SimCfnGetAtt {
    const separatorIndex = value.indexOf(".");

    if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
      throw new Error(
        "Sim CloudFormation Fn::GetAtt string value must be LogicalId.AttributeName",
      );
    }

    return new SimCfnGetAtt(
      value.slice(0, separatorIndex),
      value.slice(separatorIndex + 1),
    );
  }
}

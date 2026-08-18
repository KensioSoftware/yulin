import { SimCfnFnImportValue as SimCfnFunctionImportValue } from "../../../node/fn/import-value/sim-cfn-fn-import-value.js";
import type { SimCfnTemplateValue } from "../../../value/sim-cfn-template-value.js";
import type { SimCfnValueParser } from "../../value/sim-cfn-value-parser.type.js";

/**
 * Parses CloudFormation Fn::ImportValue values.
 *
 * Fn::ImportValue has the shape:
 *
 * {
 *   "Fn::ImportValue": "ProducerStack:ExportsOutputRefSharedQueue"
 * }
 *
 * The export name goes through the recursive value parser, since a template
 * often builds it from a Parameter with Fn::Sub or Fn::Join. Whether it
 * resolves to a string, and whether anything has published it, are both
 * resolution-time questions that belong to the node.
 */
export class SimCfnFnImportValueParser {
  constructor(private readonly valueParser: SimCfnValueParser) {}

  /**
   * Parse and validate the value inside a Fn::ImportValue expression.
   */
  parse(value: SimCfnTemplateValue): SimCfnFunctionImportValue {
    if (Array.isArray(value)) {
      throw new TypeError(
        "Sim CloudFormation Fn::ImportValue value must be an export name",
      );
    }

    return new SimCfnFunctionImportValue(this.valueParser.parse(value));
  }
}

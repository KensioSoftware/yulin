import { SimCfnFnFindInMap as SimCfnFunctionFindInMap } from "../../../node/fn/find-in-map/sim-cfn-fn-find-in-map.js";
import type { SimCfnNode } from "../../../node/sim-cfn-node.js";
import type { SimCfnTemplateValue } from "../../../value/sim-cfn-template-value.js";
import type { SimCfnValueParser } from "../../value/sim-cfn-value-parser.type.js";
import { assertDefined } from "../../../../../../util/type-guard/defined.js";
import { isRecord } from "../../../../../../util/type-guard/record.js";

/**
 * Parses CloudFormation Fn::FindInMap values.
 */
export class SimCfnFnFindInMapParser {
  constructor(private readonly valueParser: SimCfnValueParser) {}

  /**
   * Parse and validate the value inside a Fn::FindInMap expression.
   *
   * The optional fourth argument is the `{ "DefaultValue": ... }` object
   * CloudFormation answers a missing map or key with.
   */
  parse(value: SimCfnTemplateValue): SimCfnFunctionFindInMap {
    if (!Array.isArray(value) || value.length < 3 || value.length > 4) {
      throw new Error(
        "Sim CloudFormation Fn::FindInMap value must be [mapName, " +
          'topLevelKey, secondLevelKey] with an optional { "DefaultValue": ... }',
      );
    }

    const mapName = value[0];
    const topLevelKey = value[1];
    const secondLevelKey = value[2];

    assertDefined(mapName, "Fn::FindInMap map name");
    assertDefined(topLevelKey, "Fn::FindInMap top level key");
    assertDefined(secondLevelKey, "Fn::FindInMap second level key");

    return new SimCfnFunctionFindInMap({
      mapName: this.valueParser.parse(mapName),
      topLevelKey: this.valueParser.parse(topLevelKey),
      secondLevelKey: this.valueParser.parse(secondLevelKey),
      defaultValue: this.defaultValue(value[3]),
    });
  }

  /**
   * Parse the fourth argument, which the template need not carry.
   */
  private defaultValue(
    value: SimCfnTemplateValue | undefined,
  ): SimCfnNode | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (
      !isRecord(value) ||
      Object.keys(value).length !== 1 ||
      !("DefaultValue" in value)
    ) {
      throw new Error(
        'Sim CloudFormation Fn::FindInMap fourth value must be { "DefaultValue": ... }',
      );
    }

    const defaultValue = value["DefaultValue"];
    assertDefined(defaultValue, "Fn::FindInMap DefaultValue");

    return this.valueParser.parse(defaultValue);
  }
}

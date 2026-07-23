import { SimCfnFnFindInMap as SimCfnFunctionFindInMap } from "../../../node/fn/find-in-map/sim-cfn-fn-find-in-map.js";
import type { SimCfnTemplateValue } from "../../../value/sim-cfn-template-value.js";
import type { SimCfnValueParser } from "../../value/sim-cfn-value-parser.type.js";
import { assertDefined } from "../../../../../../util/type-guard/defined.js";

/**
 * Parses CloudFormation Fn::FindInMap values.
 */
export class SimCfnFnFindInMapParser {
  constructor(private readonly valueParser: SimCfnValueParser) {}

  /**
   * Parse and validate the value inside a Fn::FindInMap expression.
   */
  parse(value: SimCfnTemplateValue): SimCfnFunctionFindInMap {
    if (!Array.isArray(value) || value.length !== 3) {
      throw new Error(
        "Sim CloudFormation Fn::FindInMap value must be [mapName, topLevelKey, secondLevelKey]",
      );
    }

    const mapName = value[0];
    const topLevelKey = value[1];
    const secondLevelKey = value[2];

    assertDefined(mapName, "Fn::FindInMap map name");
    assertDefined(topLevelKey, "Fn::FindInMap top level key");
    assertDefined(secondLevelKey, "Fn::FindInMap second level key");

    return new SimCfnFunctionFindInMap(
      this.valueParser.parse(mapName),
      this.valueParser.parse(topLevelKey),
      this.valueParser.parse(secondLevelKey),
    );
  }
}

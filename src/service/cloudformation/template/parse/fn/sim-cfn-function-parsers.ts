import type { SimCfnNode } from "../../node/sim-cfn-node.js";
import type { SimCfnTemplateValue } from "../../value/sim-cfn-template-value.js";
import type { SimCfnValueParser } from "../value/sim-cfn-value-parser.type.js";
import { SimCfnFnGetAttParser as SimCfnFunctionGetAttParser } from "./get-att/sim-cfn-fn-get-att-parser.js";
import { SimCfnFnJoinParser as SimCfnFunctionJoinParser } from "./join/sim-cfn-fn-join-parser.js";
import { SimCfnFnSubParser as SimCfnFunctionSubParser } from "./sub/sim-cfn-fn-sub-parser.js";
import { SimCfnFnFindInMapParser as SimCfnFunctionFindInMapParser } from "./find-in-map/sim-cfn-fn-find-in-map-parser.js";
import { SimCfnFnIfParser as SimCfnFunctionIfParser } from "./if/sim-cfn-fn-if-parser.js";
import { SimCfnFnSplitParser as SimCfnFunctionSplitParser } from "./split/sim-cfn-fn-split-parser.js";
import { SimCfnFnSelectParser as SimCfnFunctionSelectParser } from "./select/sim-cfn-fn-select-parser.js";
import { SimCfnFnImportValueParser as SimCfnFunctionImportValueParser } from "./import-value/sim-cfn-fn-import-value-parser.js";

/** What every intrinsic function parser answers a function's value with. */
export interface SimCfnFunctionValueParser {
  parse(value: SimCfnTemplateValue): SimCfnNode;
}

/**
 * The intrinsic functions this simulator parses, by the name a template
 * writes them under.
 *
 * Each parser takes the recursive value parser where it has child values to
 * parse. Fn::GetAtt takes none, since both of its arguments are names.
 *
 * This table is the list of supported functions. A name absent from it is
 * refused by SimCfnFunctionParser rather than parsed as a plain object.
 */
export function makeSimCfnFunctionParsers(
  valueParser: SimCfnValueParser,
): ReadonlyMap<string, SimCfnFunctionValueParser> {
  return new Map<string, SimCfnFunctionValueParser>([
    ["Fn::Join", new SimCfnFunctionJoinParser(valueParser)],
    ["Fn::Sub", new SimCfnFunctionSubParser(valueParser)],
    ["Fn::GetAtt", new SimCfnFunctionGetAttParser()],
    ["Fn::FindInMap", new SimCfnFunctionFindInMapParser(valueParser)],
    ["Fn::If", new SimCfnFunctionIfParser(valueParser)],
    ["Fn::Split", new SimCfnFunctionSplitParser(valueParser)],
    ["Fn::Select", new SimCfnFunctionSelectParser(valueParser)],
    ["Fn::ImportValue", new SimCfnFunctionImportValueParser(valueParser)],
  ]);
}

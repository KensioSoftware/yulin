import {
  Pair,
  YAMLMap,
  type CollectionTag,
  type ScalarTag,
  type YAMLSeq,
} from "yaml";

/**
 * The short-form tag a YAML template can write an intrinsic function as, and
 * the name the same function carries when it is written out in full.
 *
 * This is the set the simulator parses. The functions in
 * `makeSimCfnFunctionParsers`, the `Ref` the node parser reads, and the
 * functions a Condition is built from. A tag outside it is left unresolved. A
 * template calling an intrinsic this simulation has no behaviour for is then
 * refused as the file is read.
 */
const SIM_CFN_YAML_SHORT_FORMS: ReadonlyMap<string, string> = new Map([
  ["!Ref", "Ref"],
  ["!GetAtt", "Fn::GetAtt"],
  ["!Join", "Fn::Join"],
  ["!Sub", "Fn::Sub"],
  ["!FindInMap", "Fn::FindInMap"],
  ["!If", "Fn::If"],
  ["!Split", "Fn::Split"],
  ["!Select", "Fn::Select"],
  ["!ImportValue", "Fn::ImportValue"],
  ["!And", "Fn::And"],
  ["!Equals", "Fn::Equals"],
  ["!Not", "Fn::Not"],
  ["!Or", "Fn::Or"],
  ["!Condition", "Condition"],
]);

/**
 * The YAML tags that turn CloudFormation's short-form intrinsics into the
 * objects their long forms are written as.
 *
 * `!GetAtt Bucket.Arn` becomes `{ "Fn::GetAtt": "Bucket.Arn" }`, and the rest
 * of the simulator reads the template it would have read had the template been
 * written in JSON.
 *
 * Every tag is registered against scalars, sequences and mappings alike, since
 * the tag itself only says which function the value belongs to. What shape a
 * function accepts is the business of the parser that reads its long form.
 * That parser is where `!Ref [Bucket, Arn]` is refused, and it refuses the
 * same template written in JSON.
 */
export function simCfnYamlShortFormTags(): (ScalarTag | CollectionTag)[] {
  return [...SIM_CFN_YAML_SHORT_FORMS].flatMap(([tag, functionName]) => [
    scalarShortFormTag(tag, functionName),
    collectionShortFormTag(tag, functionName, "seq"),
    collectionShortFormTag(tag, functionName, "map"),
  ]);
}

function scalarShortFormTag(tag: string, functionName: string): ScalarTag {
  return {
    tag,
    resolve: (value: string): Record<string, string> => ({
      [functionName]: value,
    }),
  };
}

function collectionShortFormTag(
  tag: string,
  functionName: string,
  collection: "map" | "seq",
): CollectionTag {
  return {
    tag,
    collection,
    // Wrapped as a node. A plain object would leave the values inside the
    // collection as nodes when the document is turned into JavaScript.
    resolve: (value: YAMLMap | YAMLSeq): YAMLMap => {
      const wrapped = new YAMLMap();
      wrapped.add(new Pair(functionName, value));

      return wrapped;
    },
  };
}

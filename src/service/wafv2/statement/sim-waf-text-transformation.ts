import { refuseSimWafRuleInput } from "./sim-waf-rule-refusals.js";
import { simWafUrlDecode } from "./sim-waf-url-decode.js";

/**
 * Minimal structural WAFv2 text transformation.
 */
export interface SimWafTextTransformationInput {
  readonly Priority?: number | undefined;
  readonly Type?: string | undefined;
}

/**
 * What a rule does to a field before it matches against it.
 */
export type SimWafTextTransform = (value: string) => string;

const namedEntities = new Map<string, string>([
  ["quot", '"'],
  ["nbsp", " "],
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
]);

const transforms = new Map<string, SimWafTextTransform>([
  ["NONE", (value): string => value],
  ["LOWERCASE", (value): string => value.toLowerCase()],
  ["URL_DECODE", simWafUrlDecode],
  ["COMPRESS_WHITE_SPACE", compressWhitespace],
  ["HTML_ENTITY_DECODE", htmlEntityDecode],
]);

/**
 * Build the transformation a rule applies to every field it reads.
 *
 * WAF applies them in ascending `Priority` rather than in the order they were
 * written, so lowercasing after decoding is a different rule from decoding
 * after lowercasing however the list is arranged.
 */
export function compileSimWafTextTransformations(
  transformations: readonly SimWafTextTransformationInput[] | undefined,
  ruleName: string,
): SimWafTextTransform {
  const ordered = (transformations ?? [])
    .toSorted((left, right) => (left.Priority ?? 0) - (right.Priority ?? 0))
    .map((transformation) => compileOne(transformation, ruleName));

  return (value): string => {
    let transformed = value;

    for (const transform of ordered) {
      transformed = transform(transformed);
    }

    return transformed;
  };
}

function compileOne(
  transformation: SimWafTextTransformationInput,
  ruleName: string,
): SimWafTextTransform {
  const transform = transforms.get(transformation.Type ?? "");

  if (transform === undefined) {
    refuseSimWafRuleInput(
      ruleName,
      `the text transformation ${String(transformation.Type)}`,
      "only NONE, LOWERCASE, URL_DECODE, COMPRESS_WHITE_SPACE and " +
        "HTML_ENTITY_DECODE are simulated",
    );
  }

  return transform;
}

/**
 * Replace every whitespace character with a space and collapse runs of them.
 *
 * The set is WAF's own, which includes the non-breaking space that a plain
 * `\s` leaves alone.
 */
function compressWhitespace(value: string): string {
  return value.replaceAll(/[\f\n\r\t\v\u{20}\u{A0}]+/gu, " ");
}

/**
 * Decode the HTML entities WAF's HTML_ENTITY_DECODE decodes, named and
 * numbered alike.
 */
function htmlEntityDecode(value: string): string {
  return value.replaceAll(
    /&(#x[\da-f]+|#\d+|[a-z]+);?/giu,
    (entity: string, body: string) =>
      decodeEntity(body.toLowerCase()) ?? entity,
  );
}

function decodeEntity(body: string): string | undefined {
  if (body.startsWith("#x")) {
    return fromCodePoint(Number.parseInt(body.slice(2), 16));
  }

  if (body.startsWith("#")) {
    return fromCodePoint(Number(body.slice(1)));
  }

  return namedEntities.get(body);
}

function fromCodePoint(codePoint: number): string | undefined {
  return Number.isSafeInteger(codePoint) &&
    codePoint >= 0 &&
    codePoint <= 0x10_ff_ff
    ? String.fromCodePoint(codePoint)
    : undefined;
}

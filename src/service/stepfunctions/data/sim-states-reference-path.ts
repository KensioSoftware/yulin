import { SimStatesPathError } from "../error/sim-step-functions.error.js";
import type { SimStatesPathSegment } from "./sim-states-path-segment.js";

const bracketPattern = /^\[(?:'((?:[^'\\]|\\.)*)'|(\d+))]/;
// The JsonPath member-name-shorthand rule. Anything outside it, punctuation
// apart from _ included, has to be written in brackets.
// oxlint-disable-next-line security/detect-unsafe-regex -- no nested quantifier.
const fieldPattern = /^[A-Za-z_\u{80}-\u{FFFF}][\w\u{80}-\u{FFFF}]*/u;

interface SimStatesReadSegment {
  readonly segment: SimStatesPathSegment;
  readonly rest: string;
}

/**
 * Parse an Amazon States Language Reference Path into its segments.
 *
 * The subset read here is the one Amazon States Language itself uses. A
 * document root, a child by dot or by bracketed name, and an array element by
 * index. The wider JSONPath grammar (filters, wildcards, slices, recursive
 * descent) is refused by name, since a path that silently selected the wrong
 * node would answer a state with plausible data.
 */
export function parseSimStatesReferencePath(
  path: string,
): readonly SimStatesPathSegment[] {
  if (path === "$") {
    return [];
  }

  if (path.startsWith("$$")) {
    throw new SimStatesPathError(
      `${path} reads the context object, which is not simulated. Only paths ` +
        "rooted at $ are read.",
    );
  }

  if (!path.startsWith("$")) {
    throw new SimStatesPathError(
      `${path} is not a Reference Path. One has to start with $.`,
    );
  }

  const segments: SimStatesPathSegment[] = [];
  let rest = path.slice(1);

  while (rest.length > 0) {
    const read = readSegment(path, rest);

    segments.push(read.segment);
    rest = read.rest;
  }

  return segments;
}

/**
 * Read the one segment at the front of what is left of a path.
 */
function readSegment(path: string, rest: string): SimStatesReadSegment {
  if (rest.startsWith("[")) {
    return readBracketSegment(path, rest);
  }

  if (rest.startsWith(".")) {
    const afterDot = rest.slice(1);

    // `$.abc.['def ghi']` is how the Amazon States Language docs write a field
    // name holding a space, so a bracket is allowed to follow a dot.
    return afterDot.startsWith("[")
      ? readBracketSegment(path, afterDot)
      : readFieldSegment(path, afterDot);
  }

  throw new SimStatesPathError(
    `${path} is not a Reference Path this simulator reads. Expected . or [ ` +
      `where it has ${rest.slice(0, 1)}. A name holding punctuation or a ` +
      "space has to be written in brackets, as in $.abc.['def ghi'].",
  );
}

/**
 * Read a bracketed segment, either a quoted field name or an array index.
 */
function readBracketSegment(path: string, rest: string): SimStatesReadSegment {
  const matched = bracketPattern.exec(rest);

  if (matched === null) {
    throw new SimStatesPathError(
      `${path} uses a bracket this simulator does not read. Only ['name'] ` +
        "and [0] are read, so wildcards, slices and filters are refused.",
    );
  }

  const [whole, quotedName, index] = matched;
  const segment: SimStatesPathSegment =
    quotedName === undefined
      ? { kind: "index", index: Number(index) }
      : { kind: "field", name: quotedName.replaceAll(String.raw`\'`, "'") };

  return { segment, rest: rest.slice(whole.length) };
}

/**
 * Read a dotted field name.
 */
function readFieldSegment(path: string, rest: string): SimStatesReadSegment {
  const matched = fieldPattern.exec(rest);

  if (matched === null) {
    throw new SimStatesPathError(
      `${path} has a dotted field name outside the JsonPath ` +
        "member-name-shorthand rule. A name holding punctuation, a space or a " +
        "wildcard has to be written in brackets, as in $.abc.['def ghi'].",
    );
  }

  const [name] = matched;

  return { segment: { kind: "field", name }, rest: rest.slice(name.length) };
}

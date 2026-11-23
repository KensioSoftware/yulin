import { SimBedrockValidationException } from "../../../error/sim-bedrock.error.js";
import { schemaPattern } from "./sim-bedrock-json-schema.js";

const lookarounds = ["(?=", "(?!", "(?<=", "(?<!"];

function compiles(pattern: string): boolean {
  try {
    schemaPattern(pattern);

    return true;
  } catch {
    return false;
  }
}

function isBackreference(escaped: string): boolean {
  return escaped === "k" || (escaped >= "1" && escaped <= "9");
}

/**
 * Whether the next character is inside a character class, given whether this
 * one is.
 */
function nextInClass(inClass: boolean, char: string): boolean {
  return inClass ? char !== "]" : char === "[";
}

/**
 * Whether a pattern uses lookaround or a backreference outside a character
 * class. `[(?=)]` matches those three characters, and Bedrock accepts it.
 */
function usesLookaroundOrBackreference(pattern: string): boolean {
  let inClass = false;
  let index = 0;

  while (index < pattern.length) {
    const char = pattern.charAt(index);
    const outside = !inClass;

    if (char === "\\") {
      if (outside && isBackreference(pattern.charAt(index + 1))) {
        return true;
      }

      index += 2;
      continue;
    }

    if (
      outside &&
      lookarounds.some((each) => pattern.startsWith(each, index))
    ) {
      return true;
    }

    inClass = nextInClass(inClass, char);
    index += 1;
  }

  return false;
}

/**
 * Refuse a `pattern` Bedrock refuses. It must be a regular expression that
 * compiles and uses neither lookaround nor backreferences.
 */
export function checkPattern(pattern: unknown): void {
  if (pattern === undefined) {
    return;
  }

  const source = typeof pattern === "string" ? pattern : "";

  if (
    source.length === 0 ||
    !compiles(source) ||
    usesLookaroundOrBackreference(source)
  ) {
    throw new SimBedrockValidationException("Invalid regex in pattern field.");
  }
}

import { SimBedrockValidationException } from "../../../error/sim-bedrock.error.js";
import {
  isJsonObject,
  schemaNode,
  type SimBedrockSchemaNode,
} from "./sim-bedrock-json-schema.js";

const arrayIndex = /^(?:0|[1-9]\d*)$/u;

function unescapedPointerToken(token: string): string {
  return token.replaceAll("~1", "/").replaceAll("~0", "~");
}

/**
 * Step one token of a JSON pointer into a value, which may be an object or
 * an array.
 */
function pointerStep(value: unknown, token: string): unknown {
  if (Array.isArray(value)) {
    return arrayIndex.test(token) ? value.at(Number(token)) : undefined;
  }

  return isJsonObject(value)
    ? Object.getOwnPropertyDescriptor(value, unescapedPointerToken(token))
        ?.value
    : undefined;
}

/**
 * Resolve an internal `$ref` against the root schema.
 *
 * Only references into the same document (`#` and `#/...`) resolve. Bedrock
 * refuses an external reference, and so does this.
 */
export function resolveSchemaRef(
  root: SimBedrockSchemaNode,
  ref: string,
): SimBedrockSchemaNode {
  if (ref !== "#" && !ref.startsWith("#/")) {
    throw new SimBedrockValidationException(
      `The structured output schema references ${ref}. Only internal ` +
        `references are supported.`,
    );
  }

  const resolved = ref
    .split("/")
    .slice(1)
    .reduce<unknown>((value, token) => pointerStep(value, token), root);

  if (resolved === undefined) {
    throw new SimBedrockValidationException(
      `The structured output schema references ${ref}, which it does not ` +
        `define`,
    );
  }

  return schemaNode(resolved, ref);
}

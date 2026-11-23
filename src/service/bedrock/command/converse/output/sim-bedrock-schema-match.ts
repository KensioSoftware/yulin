import {
  schemaNode,
  schemaText,
  type SimBedrockSchemaNode,
} from "./sim-bedrock-json-schema.js";
import { resolveSchemaRef } from "./sim-bedrock-schema-pointer.js";
import {
  firstFound,
  memberMismatch,
  objectEntryMismatch,
} from "./sim-bedrock-member-mismatch.js";
import {
  patternMismatch,
  pointer,
  shown,
  typeMismatch,
  valueMismatch,
  type SchemaObject,
} from "./sim-bedrock-value-mismatch.js";

/**
 * Finds where a reply departs from a structured output schema.
 *
 * It reads the keywords `SimBedrockSchemaSubset` accepts, apart from `format`.
 * A string with a declared format is checked as a string.
 */
export class SimBedrockSchemaMatch {
  private readonly root: SimBedrockSchemaNode;
  private readonly refResults = new Map<string, string | undefined>();

  constructor(root: SimBedrockSchemaNode) {
    this.root = root;
  }

  /**
   * The first place the value departs from the schema, or undefined where it
   * matches.
   */
  mismatch(value: unknown): string | undefined {
    this.refResults.clear();

    return this.nodeMismatch(value, this.root, "");
  }

  private nodeMismatch(
    value: unknown,
    node: SimBedrockSchemaNode,
    at: string,
  ): string | undefined {
    if (typeof node === "boolean") {
      return node ? undefined : `${pointer(at)} is not allowed`;
    }

    return (
      typeMismatch(value, node, at) ??
      valueMismatch(value, node, at) ??
      patternMismatch(value, node, at) ??
      memberMismatch(value, node, at) ??
      this.refMismatch(value, node, at) ??
      this.combinedMismatch(value, node, at) ??
      this.childMismatch(value, node, at)
    );
  }

  private refMismatch(
    value: unknown,
    node: SchemaObject,
    at: string,
  ): string | undefined {
    const { $ref: ref } = node;

    if (ref === undefined) {
      return undefined;
    }

    // The value at one place in a reply is always the same value, so a
    // target checked there once answers every other reference to it there.
    const target = schemaText(ref);
    const key = `${target}\n${at}`;

    if (!this.refResults.has(key)) {
      this.refResults.set(
        key,
        this.nodeMismatch(value, resolveSchemaRef(this.root, target), at),
      );
    }

    return this.refResults.get(key);
  }

  private combinedMismatch(
    value: unknown,
    node: SchemaObject,
    at: string,
  ): string | undefined {
    const { allOf, anyOf } = node;
    const check = (each: unknown): string | undefined =>
      this.nodeMismatch(value, schemaNode(each, at), at);
    const found = firstFound(Array.isArray(allOf) ? allOf : [], check);

    return Array.isArray(anyOf) &&
      anyOf.every((each) => check(each) !== undefined)
      ? `${pointer(at)} is ${shown(value)}, which matches none of the anyOf schemas`
      : found;
  }

  /**
   * Where a property of an object, or an item of an array, departs from the
   * schema for it.
   */
  private childMismatch(
    value: unknown,
    node: SchemaObject,
    at: string,
  ): string | undefined {
    if (Array.isArray(value) && node["items"] !== undefined) {
      const items = schemaNode(node["items"], at);

      return firstFound(value.entries(), ([index, item]) =>
        this.nodeMismatch(item, items, `${at}/${index}`),
      );
    }

    return objectEntryMismatch(value, node, at, (member, schema, memberAt) =>
      this.nodeMismatch(member, schemaNode(schema, memberAt), memberAt),
    );
  }
}

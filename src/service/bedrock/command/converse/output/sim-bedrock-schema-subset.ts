import { SimBedrockValidationException } from "../../../error/sim-bedrock.error.js";
import {
  isJsonObject,
  namedTypes,
  resolveSchemaRef,
  schemaNode,
  schemaText,
  type SimBedrockSchemaNode,
} from "./sim-bedrock-json-schema.js";
import { checkSchemaKeywords } from "./sim-bedrock-schema-keywords.js";

const maxOptionalProperties = 12;
const maxUnionProperties = 16;

function isUnion(node: SimBedrockSchemaNode): boolean {
  return isJsonObject(node) && (namedTypes(node).length > 1 || "anyOf" in node);
}

function subschemas(value: unknown, at: string): readonly unknown[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new SimBedrockValidationException(
      `The structured output schema at ${at} is not a list of schemas`,
    );
  }

  return value;
}

/**
 * Checks a structured output schema against the JSON Schema subset Bedrock
 * supports.
 *
 * Bedrock refuses an unsupported schema with a 400 before any model runs, and
 * each refusal here is one Bedrock documents. A keyword Bedrock documents
 * neither way is refused as unsimulated. A reply declared against the schema
 * is checked against every keyword the schema uses, and one the checker
 * cannot read would let through a reply Bedrock could never send.
 *
 * Internal `$ref` targets are checked where they are referenced. A definition
 * nothing references is left unchecked.
 */
export class SimBedrockSchemaSubset {
  private readonly root: SimBedrockSchemaNode;
  private readonly refsInProgress: string[] = [];
  private optionalProperties = 0;
  private unionProperties = 0;

  private constructor(root: SimBedrockSchemaNode) {
    this.root = root;
  }

  /**
   * Refuse a schema Bedrock would refuse.
   */
  static check(root: SimBedrockSchemaNode): void {
    new SimBedrockSchemaSubset(root).checkRoot();
  }

  private checkRoot(): void {
    this.checkNode(this.root, "#");

    if (this.optionalProperties > maxOptionalProperties) {
      throw new SimBedrockValidationException("Schema is too complex.");
    }

    if (this.unionProperties > maxUnionProperties) {
      throw new SimBedrockValidationException(
        `The structured output schema has ${this.unionProperties} ` +
          `union-typed properties. At most ${maxUnionProperties} are ` +
          `supported.`,
      );
    }
  }

  private checkNode(node: SimBedrockSchemaNode, at: string): void {
    if (typeof node === "boolean") {
      return;
    }

    checkSchemaKeywords(node, at);

    this.checkRef(node["$ref"]);
    this.checkProperties(node, at);
    this.checkSubschemas(node, at);
  }

  private checkRef(ref: unknown): void {
    if (ref === undefined) {
      return;
    }

    const target = schemaText(ref);

    if (this.refsInProgress.includes(target)) {
      throw new SimBedrockValidationException(
        `The structured output schema refers to ${target} from inside ` +
          `itself. Recursive schemas are not supported.`,
      );
    }

    this.refsInProgress.push(target);
    this.checkNode(resolveSchemaRef(this.root, target), target);
    this.refsInProgress.pop();
  }

  private checkProperties(
    node: Readonly<Record<string, unknown>>,
    at: string,
  ): void {
    const { properties, required } = node;

    if (!isJsonObject(properties)) {
      return;
    }

    const requiredNames = Array.isArray(required) ? required : [];

    for (const [name, value] of Object.entries(properties)) {
      const property = schemaNode(value, `${at}/properties/${name}`);

      this.optionalProperties += requiredNames.includes(name) ? 0 : 1;
      this.unionProperties += isUnion(property) ? 1 : 0;
      this.checkNode(property, `${at}/properties/${name}`);
    }
  }

  private checkSubschemas(
    node: Readonly<Record<string, unknown>>,
    at: string,
  ): void {
    if (node["items"] !== undefined) {
      this.checkNode(schemaNode(node["items"], `${at}/items`), `${at}/items`);
    }

    const combined = [
      ["anyOf", node["anyOf"]],
      ["allOf", node["allOf"]],
    ] as const;

    for (const [keyword, value] of combined) {
      const listed = subschemas(value, at);

      for (const [index, each] of listed.entries()) {
        const subAt = `${at}/${keyword}/${index}`;

        this.checkNode(schemaNode(each, subAt), subAt);
      }
    }
  }
}

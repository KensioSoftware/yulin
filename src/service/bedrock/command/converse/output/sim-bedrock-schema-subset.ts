import { SimBedrockValidationException } from "../../../error/sim-bedrock.error.js";
import {
  isJsonObject,
  schemaNode,
  schemaText,
  type SimBedrockSchemaNode,
} from "./sim-bedrock-json-schema.js";
import { resolveSchemaRef } from "./sim-bedrock-schema-pointer.js";
import { checkSchemaKeywords } from "./sim-bedrock-schema-keywords.js";
import {
  isUnion,
  refuseOverLimits,
  subschemas,
} from "./sim-bedrock-schema-limits.js";

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
 * Internal `$ref` targets are checked where they are first referenced, and
 * their properties counted wherever they are referenced. A definition nothing
 * references is left unchecked.
 */
export class SimBedrockSchemaSubset {
  private readonly root: SimBedrockSchemaNode;
  private readonly refsInProgress: string[] = [];
  private readonly checkedRefs = new Map<string, readonly [number, number]>();
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

    refuseOverLimits(this.optionalProperties, this.unionProperties);
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
    const counted = this.checkedRefs.get(target);

    if (counted !== undefined) {
      this.count(...counted);

      return;
    }

    if (this.refsInProgress.includes(target)) {
      throw new SimBedrockValidationException(
        `The structured output schema refers to ${target} from inside ` +
          `itself. Recursive schemas are not supported.`,
      );
    }

    const optionalBefore = this.optionalProperties;
    const unionBefore = this.unionProperties;

    this.refsInProgress.push(target);
    this.checkNode(resolveSchemaRef(this.root, target), target);
    this.refsInProgress.pop();
    this.checkedRefs.set(target, [
      this.optionalProperties - optionalBefore,
      this.unionProperties - unionBefore,
    ]);
  }

  /**
   * Count the optional and union-typed properties of a target already
   * checked once, where it is referenced again.
   */
  private count(optional: number, union: number): void {
    this.optionalProperties += optional;
    this.unionProperties += union;
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

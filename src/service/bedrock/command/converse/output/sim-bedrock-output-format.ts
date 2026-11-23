import { SimBedrockDeclarationError } from "../../../error/sim-bedrock.error.js";
import type { SimBedrockResolvedResponse } from "../../../response/sim-bedrock-resolved-response.js";
import { SimBedrockUnsimulatedInput } from "../../sim-bedrock-unsimulated-input.js";
import { schemaNode, schemaText } from "./sim-bedrock-json-schema.js";
import {
  parsedSchema,
  requireJsonSchema,
  requireObject,
} from "./sim-bedrock-output-config-members.js";
import { SimBedrockSchemaMatch } from "./sim-bedrock-schema-match.js";
import { SimBedrockSchemaSubset } from "./sim-bedrock-schema-subset.js";

/**
 * The stop reason of a reply cut short by the token limit.
 *
 * Bedrock documents that such a reply carries incomplete JSON even with
 * structured outputs on, so it is left unchecked.
 */
const maxTokensStopReason = "max_tokens";

function replyText(response: SimBedrockResolvedResponse): string | undefined {
  const texts = response
    .message()
    .content.map((block) => block.text)
    .filter((text) => text !== undefined);

  return texts.length === 0 ? undefined : texts.join("");
}

function parsedReply(text: string): { readonly value: unknown } | undefined {
  try {
    return { value: JSON.parse(text) };
  } catch {
    return undefined;
  }
}

/**
 * The structured output format a `Converse` request asks for.
 *
 * Real Bedrock constrains the model's text to the schema while it is
 * generated. Simulated Bedrock has no model to constrain, so it checks the
 * declared reply instead. A reply the schema refuses is one Bedrock could
 * never send, and answering with it would pass a test against behaviour that
 * cannot happen. It is refused as a declaration error naming the mismatch.
 */
export class SimBedrockOutputFormat {
  private readonly operation: string;
  private readonly name: string;
  private readonly match: SimBedrockSchemaMatch;

  private constructor(
    operation: string,
    name: string,
    match: SimBedrockSchemaMatch,
  ) {
    this.operation = operation;
    this.name = name;
    this.match = match;
  }

  /**
   * Read the `outputConfig` of a request, refusing one Bedrock would refuse.
   *
   * `effort` is refused as unsimulated. It changes how long a model reasons,
   * and only some models accept it.
   */
  static fromInput(
    outputConfig: unknown,
    operation: string,
  ): SimBedrockOutputFormat | undefined {
    if (outputConfig === undefined) {
      return undefined;
    }

    const config = requireObject(outputConfig, "outputConfig");

    new SimBedrockUnsimulatedInput(
      `${operation} outputConfig`,
    ).refuseUnaccepted(config, ["textFormat"]);

    return config["textFormat"] === undefined
      ? undefined
      : this.fromTextFormat(
          operation,
          requireObject(config["textFormat"], "outputConfig.textFormat"),
        );
  }

  private static fromTextFormat(
    operation: string,
    textFormat: Readonly<Record<string, unknown>>,
  ): SimBedrockOutputFormat {
    const jsonSchema = requireJsonSchema(textFormat);
    const root = schemaNode(parsedSchema(jsonSchema["schema"]), "#");

    SimBedrockSchemaSubset.check(root);

    return new SimBedrockOutputFormat(
      operation,
      schemaText(jsonSchema["name"] ?? "unnamed"),
      new SimBedrockSchemaMatch(root),
    );
  }

  /**
   * Refuse a declared reply the schema would have prevented.
   *
   * A reply holding only tool calls has no text to check. A reply stopped at
   * the token limit is left alone, as Bedrock sends incomplete JSON then.
   */
  requireConforming(response: SimBedrockResolvedResponse): void {
    const text = replyText(response);

    if (text === undefined || response.stopReason() === maxTokensStopReason) {
      return;
    }

    const parsed = parsedReply(text);
    const mismatch =
      parsed === undefined
        ? `its text is not JSON: ${JSON.stringify(text)}`
        : this.match.mismatch(parsed.value);

    if (mismatch !== undefined) {
      throw new SimBedrockDeclarationError(
        `A ${this.operation} call asking for the structured output ${this.name} ` +
          `matched the response declared for ${response.subject}, and ${mismatch}. Bedrock constrains ` +
          `the reply to the schema and could never send this one. Declare a ` +
          `reply the schema accepts.`,
      );
    }
  }
}

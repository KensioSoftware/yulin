import { SimBedrockDeclarationError } from "../error/sim-bedrock.error.js";
import type {
  SimBedrockDeclaredContentBlock,
  SimBedrockDeclaredResponse,
} from "./sim-bedrock-response-declaration.js";

function checkedBlock(
  subject: string,
  block: SimBedrockDeclaredContentBlock,
): SimBedrockDeclaredContentBlock {
  const { text, toolUse } = block;

  if (text !== undefined && toolUse !== undefined) {
    throw new SimBedrockDeclarationError(
      `A content block declared for ${subject} carries both text and a tool ` +
        `use. A block is one or the other, as it is on real Bedrock.`,
    );
  }

  if (text === undefined && toolUse === undefined) {
    throw new SimBedrockDeclarationError(
      `A content block declared for ${subject} carries neither text nor a ` +
        `tool use, and there is nothing for a response to answer with.`,
    );
  }

  return block;
}

function blocksOf(
  subject: string,
  declared: SimBedrockDeclaredResponse,
): readonly SimBedrockDeclaredContentBlock[] | undefined {
  const { text, content } = declared;

  if (text !== undefined && content !== undefined) {
    throw new SimBedrockDeclarationError(
      `The response declared for ${subject} carries both text and content ` +
        `blocks. Text is the short form of one text block, so declare one or ` +
        `the other.`,
    );
  }

  if (text !== undefined) {
    return [{ text }];
  }

  return content?.map((block) => checkedBlock(subject, block));
}

/**
 * The content blocks a declared response answers `Converse` with.
 *
 * A response declared as a body alone has none, which is the ordinary case
 * rather than an error: it answers `InvokeModel`. A response with no content
 * and no body has nothing to answer anything with, and is refused where it was
 * written.
 */
export function simBedrockDeclaredContent(
  subject: string,
  declared: SimBedrockDeclaredResponse,
): readonly SimBedrockDeclaredContentBlock[] | undefined {
  const blocks = blocksOf(subject, declared);

  if (blocks === undefined && declared.body === undefined) {
    throw new SimBedrockDeclarationError(
      `The response declared for ${subject} carries no text, no content and ` +
        `no body. Declare text or content for Converse, or a body for ` +
        `InvokeModel.`,
    );
  }

  return blocks;
}

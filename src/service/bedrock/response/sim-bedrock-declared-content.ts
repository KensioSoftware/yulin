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

/**
 * The members a response used to say what the message holds.
 *
 * One response says it one way. `text` is a single block, `chunks` is that
 * block written as the deltas a stream sends, and `content` is the blocks
 * themselves.
 */
function namedMessageMembers(
  declared: SimBedrockDeclaredResponse,
): readonly string[] {
  const named: string[] = [];

  if (declared.text !== undefined) {
    named.push("text");
  }

  if (declared.chunks !== undefined) {
    named.push("chunks");
  }

  if (declared.content !== undefined) {
    named.push("content");
  }

  return named;
}

function requireOneMessageMember(
  subject: string,
  declared: SimBedrockDeclaredResponse,
): void {
  const named = namedMessageMembers(declared);

  if (named.length > 1) {
    throw new SimBedrockDeclarationError(
      `The response declared for ${subject} carries ${named.join(" and ")}. ` +
        `Each of those says what the message holds, so declare one of them.`,
    );
  }
}

function blocksOf(
  subject: string,
  declared: SimBedrockDeclaredResponse,
): readonly SimBedrockDeclaredContentBlock[] | undefined {
  const { text, chunks, content } = declared;

  requireOneMessageMember(subject, declared);

  if (text !== undefined) {
    return [{ text }];
  }

  if (chunks !== undefined) {
    return [{ text: chunks.join("") }];
  }

  return content?.map((block) => checkedBlock(subject, block));
}

/**
 * The content blocks a declared response answers `Converse` with.
 *
 * A response declared as chunks holds them joined, so the same declaration
 * answers `Converse` with the whole text and `ConverseStream` with the deltas
 * it was written in.
 *
 * A response declared as a body alone has no content, which is the ordinary
 * case rather than an error: it answers `InvokeModel`. A response with no
 * content and no body has nothing to answer anything with, and is refused
 * where it was written.
 */
export function simBedrockDeclaredContent(
  subject: string,
  declared: SimBedrockDeclaredResponse,
): readonly SimBedrockDeclaredContentBlock[] | undefined {
  const blocks = blocksOf(subject, declared);

  if (blocks === undefined && declared.body === undefined) {
    throw new SimBedrockDeclarationError(
      `The response declared for ${subject} carries no text, no content and ` +
        `no body. Declare text, chunks or content for Converse, or a body ` +
        `for InvokeModel.`,
    );
  }

  return blocks;
}

import { SimBedrockDeclarationError } from "../error/sim-bedrock.error.js";
import { simBedrockDeclaredContent } from "./sim-bedrock-declared-content.js";
import {
  simBedrockDeclaredUsage,
  type SimBedrockResponseUsage,
} from "./sim-bedrock-declared-usage.js";
import type {
  SimBedrockDeclaredContentBlock,
  SimBedrockDeclaredResponse,
} from "./sim-bedrock-response-declaration.js";
import { simBedrockDefaultStopReason } from "./sim-bedrock-response-defaults.js";

/**
 * The message one `Converse` call answers with.
 */
export interface SimBedrockResponseMessage {
  readonly role: "assistant";
  readonly content: readonly SimBedrockDeclaredContentBlock[];
}

const toolUseStopReason = "tool_use";

/**
 * One declared response, resolved from its declaration.
 *
 * The declaration is resolved when the rule is registered, so a content block
 * carrying two kinds of content at once, or a negative token count, is refused
 * where it was written. What the response can answer is resolved per call,
 * because which operation reaches a rule is only known then.
 */
export class SimBedrockResolvedResponse {
  private readonly subject: string;
  private readonly declared: SimBedrockDeclaredResponse;
  private readonly declaredUsage: SimBedrockResponseUsage;
  private readonly content:
    | readonly SimBedrockDeclaredContentBlock[]
    | undefined;

  constructor(subject: string, declared: SimBedrockDeclaredResponse) {
    this.subject = subject;
    this.declared = declared;
    this.content = simBedrockDeclaredContent(subject, declared);
    this.declaredUsage = simBedrockDeclaredUsage(subject, declared);
  }

  /**
   * The message a `Converse` call answers with.
   *
   * A response declared for `InvokeModel` alone has no message, and reaching
   * it from `Converse` is a declaration this simulation cannot answer with.
   */
  message(): SimBedrockResponseMessage {
    if (this.content === undefined) {
      throw new SimBedrockDeclarationError(
        `A Converse call matched the response declared for ${this.subject}, ` +
          `which carries a body and nothing else. A body answers InvokeModel. ` +
          `Declare text or content for Converse.`,
      );
    }

    return { role: "assistant", content: this.content };
  }

  /**
   * The body an `InvokeModel` call answers with, before it is serialized.
   */
  body(): unknown {
    if (this.declared.body === undefined) {
      throw new SimBedrockDeclarationError(
        `An InvokeModel call matched the response declared for ` +
          `${this.subject}, which carries no body. A response body is the ` +
          `shape the model behind the id uses, so simulated Bedrock has no ` +
          `default for it. Declare one with a body.`,
      );
    }

    return this.declared.body;
  }

  /**
   * Why the model stopped generating.
   *
   * A response holding a tool use stops for that, as a real one does, unless
   * the declaration named a reason of its own.
   */
  stopReason(): string {
    return this.declared.stopReason ?? this.reachedStopReason();
  }

  /**
   * The token counts the response reports.
   */
  usage(): SimBedrockResponseUsage {
    return this.declaredUsage;
  }

  private reachedStopReason(): string {
    const callsATool =
      this.content?.some((block) => block.toolUse !== undefined) === true;

    return callsATool ? toolUseStopReason : simBedrockDefaultStopReason;
  }
}

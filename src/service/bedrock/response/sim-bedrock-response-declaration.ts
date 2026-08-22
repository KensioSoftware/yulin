/**
 * A tool call a declared response asks the caller to make.
 *
 * The input is whatever the declaration carried. Real Bedrock hands back the
 * arguments the model generated, and simulated Bedrock has no model to
 * generate them.
 */
export interface SimBedrockDeclaredToolUse {
  readonly toolUseId?: string | undefined;
  readonly name?: string | undefined;
  readonly input?: unknown;
}

/**
 * One content block of a declared response message.
 *
 * A block carries text or a tool call. Declaring both on one block, or
 * neither, is refused where the rule is written.
 */
export interface SimBedrockDeclaredContentBlock {
  readonly text?: string | undefined;
  readonly toolUse?: SimBedrockDeclaredToolUse | undefined;
}

/**
 * The token counts a declared response reports.
 *
 * Every count is optional and an absent one falls back to the built-in figure.
 * Real Bedrock counts tokens with the model's own tokenizer, which simulated
 * Bedrock has no way to run.
 */
export interface SimBedrockDeclaredUsage {
  readonly inputTokens?: number | undefined;
  readonly outputTokens?: number | undefined;
}

/**
 * What simulated Bedrock answers one request with.
 *
 * The members an operation reads are the ones it can use. `Converse` answers
 * from `text` or `content`, and `InvokeModel` answers from `body`. A
 * declaration carrying nothing the operation asking for it can use is refused
 * where the call is made rather than answered with the built-in default.
 *
 * `text` is the short form of a single text content block, and declaring both
 * it and `content` is refused where the rule is written.
 */
export interface SimBedrockDeclaredResponse {
  readonly text?: string | undefined;
  readonly content?: readonly SimBedrockDeclaredContentBlock[] | undefined;
  readonly body?: unknown;
  readonly stopReason?: string | undefined;
  readonly usage?: SimBedrockDeclaredUsage | undefined;
}

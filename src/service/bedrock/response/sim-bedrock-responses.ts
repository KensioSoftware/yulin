import { SimDeclaredResultRules } from "../../../util/rule/sim-declared-result-rules.js";
import { SimBedrockDeclarationError } from "../error/sim-bedrock.error.js";
import type { SimBedrockDeclaredResponse } from "./sim-bedrock-response-declaration.js";
import { simBedrockDefaultResponse } from "./sim-bedrock-response-defaults.js";
import { SimBedrockResolvedResponse } from "./sim-bedrock-resolved-response.js";

/**
 * The request a response rule is matched against.
 */
export interface SimBedrockResponseRequest {
  readonly prompt?: string | undefined;
  readonly system?: string | undefined;
  readonly modelId?: string | undefined;
}

function requireRuleKey(key: string, description: string): string {
  if (key.length === 0) {
    throw new SimBedrockDeclarationError(
      `A simulated Bedrock rule needs ${description} to match`,
    );
  }

  return key;
}

/**
 * The responses one simulated Bedrock answers model invocations with.
 *
 * A rule for an exact prompt wins, then a rule for an exact system prompt, then
 * a rule for an exact model id, then the default. The prompt and model tiers
 * are `SimDeclaredResultRules`, which simulated Rekognition matches images with
 * and simulated Personalize matches recommendation requests with. The system
 * tier sits between them and is Bedrock's own, as is which key each tier
 * holds.
 *
 * Prompt is the specific tier and model the broad one. A model rule covers
 * every call to that model, which is what a test asserting on the code around
 * the call wants. A prompt rule picks out the one exchange a test is about.
 *
 * A system rule covers one feature. Two features of one application often
 * call the same model with different instructions, and their replies take
 * different shapes (a JSON verdict for one, free text for the other). A model
 * rule cannot tell them apart. A system rule can, and it still answers every
 * prompt the feature sends.
 *
 * Rules sit on the service and name no resource. Real Bedrock invokes a
 * foundation model that was there before the account was, leaving a test
 * nothing to create and a rule nothing to hang off.
 */
export class SimBedrockResponses {
  private readonly rules =
    new SimDeclaredResultRules<SimBedrockResolvedResponse>(
      new SimBedrockResolvedResponse(
        "any request with no rule of its own (the built-in default)",
        simBedrockDefaultResponse,
      ),
    );

  private readonly bySystem = new Map<string, SimBedrockResolvedResponse>();

  /**
   * Answer with this response for any request no other rule matches.
   */
  byDefault(response: SimBedrockDeclaredResponse): void {
    this.rules.byDefault(
      new SimBedrockResolvedResponse("any request", response),
    );
  }

  /**
   * Answer with this response for a request carrying this exact prompt.
   *
   * The prompt of a `Converse` request is the text of its last user message.
   * The prompt of an `InvokeModel` request is its body decoded as UTF-8, since
   * the body is model-specific and Bedrock reads nothing inside it.
   */
  onPrompt(prompt: string, response: SimBedrockDeclaredResponse): void {
    this.rules.onLeadingKey(
      requireRuleKey(prompt, "a prompt"),
      new SimBedrockResolvedResponse(`the prompt '${prompt}'`, response),
    );
  }

  /**
   * Answer with this response for a request carrying this exact system prompt,
   * where no prompt rule matched it first.
   *
   * The system prompt of a `Converse` request is the text of its `system`
   * blocks, joined with a newline in the order they were sent. Blocks holding
   * no text, such as a cache point, are skipped. An `InvokeModel` request has
   * no system field of its own (any system prompt sits inside the
   * model-specific body), so a system rule never matches one.
   */
  onSystem(system: string, response: SimBedrockDeclaredResponse): void {
    this.bySystem.set(
      requireRuleKey(system, "a system prompt"),
      new SimBedrockResolvedResponse(`the system prompt '${system}'`, response),
    );
  }

  /**
   * Answer with this response for a request naming this exact model, where no
   * prompt or system rule matched it first.
   *
   * The model is matched as the request wrote it. A request naming an
   * inference profile or a model ARN matches a rule declared under that same
   * value.
   */
  onModel(modelId: string, response: SimBedrockDeclaredResponse): void {
    this.rules.onTrailingKey(
      requireRuleKey(modelId, "a model id"),
      new SimBedrockResolvedResponse(`the model '${modelId}'`, response),
    );
  }

  /**
   * The response declared for one request.
   */
  responseFor(request: SimBedrockResponseRequest): SimBedrockResolvedResponse {
    return (
      this.rules.declaredFor({ leading: request.prompt }) ??
      this.bySystem.get(request.system ?? "") ??
      this.rules.resultFor({ trailing: request.modelId })
    );
  }
}

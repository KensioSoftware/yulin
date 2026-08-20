import type {
  SimWafCustomRequestHandlingInput,
  SimWafCustomResponseInput,
} from "./sim-waf-custom-response.type.js";

/**
 * What a rule does with a request it claims.
 */
export type SimWafActionKind = "ALLOW" | "BLOCK" | "COUNT";

/**
 * Minimal structural WAFv2 RuleAction, which is also the shape of a web ACL's
 * DefaultAction bar the two actions a default action cannot take.
 */
export interface SimWafActionInput {
  readonly Allow?: SimWafHandledActionInput | undefined;
  readonly Block?:
    | { readonly CustomResponse?: SimWafCustomResponseInput | undefined }
    | undefined;
  readonly Count?: SimWafHandledActionInput | undefined;
  readonly Captcha?: unknown;
  readonly Challenge?: unknown;
}

/**
 * An action that can add headers to the request it lets through.
 */
export interface SimWafHandledActionInput {
  readonly CustomRequestHandling?: SimWafCustomRequestHandlingInput | undefined;
}

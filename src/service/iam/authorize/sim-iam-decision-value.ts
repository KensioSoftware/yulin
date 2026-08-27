/**
 * What one simulated IAM authorization attempt came to.
 *
 * A denial is one of two things, and which one it is says what to change. An
 * explicit deny means a statement matched and refused. An implicit deny means
 * nothing allowed the request in the first place.
 */
export const SimIamPolicyDecisionValue = {
  ExplicitDeny: "ExplicitDeny",
  Allow: "Allow",
  ImplicitDeny: "ImplicitDeny",
} as const;

export type SimIamPolicyDecisionValue =
  (typeof SimIamPolicyDecisionValue)[keyof typeof SimIamPolicyDecisionValue];

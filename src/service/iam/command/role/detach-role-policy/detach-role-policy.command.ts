/**
 * Minimal structural sim IAM DetachRolePolicy command.
 */
export interface SimDetachRolePolicyCommand {
  readonly input: SimDetachRolePolicyCommandInput;
}

/**
 * Minimal structural sim IAM DetachRolePolicy input.
 */
export interface SimDetachRolePolicyCommandInput {
  readonly RoleName?: string | undefined;
  readonly PolicyArn?: string | undefined;
}

/**
 * Minimal structural sim IAM DetachRolePolicy output.
 *
 * Real IAM answers a successful DetachRolePolicy with an empty response body.
 */
export type SimDetachRolePolicyCommandOutput = Record<string, never>;

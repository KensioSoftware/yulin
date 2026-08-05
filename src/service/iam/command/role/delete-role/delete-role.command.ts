/**
 * Minimal structural sim IAM DeleteRole command.
 */
export interface SimDeleteRoleCommand {
  readonly input: SimDeleteRoleCommandInput;
}

/**
 * Minimal structural sim IAM DeleteRole input.
 */
export interface SimDeleteRoleCommandInput {
  readonly RoleName?: string | undefined;
}

/**
 * Minimal structural sim IAM DeleteRole output.
 *
 * Real IAM answers a successful DeleteRole with an empty response body.
 */
export type SimDeleteRoleCommandOutput = Record<string, never>;

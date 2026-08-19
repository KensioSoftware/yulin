/**
 * Minimal structural sim IAM DeleteUser command.
 */
export interface SimDeleteUserCommand {
  readonly input: SimDeleteUserCommandInput;
}

/**
 * Minimal structural sim IAM DeleteUser input.
 */
export interface SimDeleteUserCommandInput {
  readonly UserName?: string | undefined;
}

/**
 * Minimal structural sim IAM DeleteUser output.
 *
 * Real IAM answers a successful DeleteUser with an empty response body.
 */
export type SimDeleteUserCommandOutput = Record<string, never>;

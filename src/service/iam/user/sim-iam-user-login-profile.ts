/**
 * The console sign-in profile of a simulated IAM User.
 *
 * Real IAM never reads a password back. `CreateLoginProfile` takes one and
 * `GetLoginProfile` answers without it, so the password kept here is only
 * reachable through the simulator's own `SimIam.users`, which is where a test
 * asserting on it has to look.
 */
export interface SimIamUserLoginProfile {
  readonly password: string;
  readonly createDate: Date;
  readonly passwordResetRequired: boolean;
}

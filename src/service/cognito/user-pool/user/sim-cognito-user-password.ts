/**
 * The password one simulated user can authenticate with.
 *
 * The value is held rather than hashed, and nothing exposes it: a caller can
 * only ask whether a candidate matches. That is a modelling choice rather than
 * a security boundary, as it is for simulated KMS key material, since this all
 * runs in one process and anything sharing that process can reach the object.
 */
export class SimCognitoUserPassword {
  private readonly value: string;

  constructor(value: string) {
    this.value = value;
  }

  /**
   * Whether a candidate password is this one.
   */
  matches(candidate: string | undefined): boolean {
    return candidate === this.value;
  }
}

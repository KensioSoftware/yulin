/**
 * How a resource-policy statement came to apply to the caller.
 *
 * AWS treats these two differently. A statement naming the caller's own ARN is
 * a grant to that principal. A statement naming the Account, as a bare account
 * ID or a root ARN, delegates the decision to that Account's IAM rather than
 * granting anything by itself. Most of this simulator does not yet act on the
 * difference; a KMS key policy does, because it is the whole reason the
 * default key policy does not make a key usable by everyone in the Account.
 */
export class SimIamPrincipalMatch {
  public readonly matched: boolean;
  public readonly isAccountDelegation: boolean;

  private constructor(matched: boolean, isAccountDelegation: boolean) {
    this.matched = matched;
    this.isAccountDelegation = isAccountDelegation;
  }

  /**
   * The statement does not apply to this caller.
   */
  static none(): SimIamPrincipalMatch {
    return new SimIamPrincipalMatch(false, false);
  }

  /**
   * The statement names this caller, or applies without naming an Account.
   */
  static direct(): SimIamPrincipalMatch {
    return new SimIamPrincipalMatch(true, false);
  }

  /**
   * The statement applies by way of the caller's Account.
   */
  static accountDelegation(): SimIamPrincipalMatch {
    return new SimIamPrincipalMatch(true, true);
  }

  /**
   * The first match among alternatives, since Principal lists are an OR.
   *
   * A direct match wins over a delegated one where both apply, because a
   * statement naming the caller grants to the caller whatever else it says.
   */
  static first(matches: readonly SimIamPrincipalMatch[]): SimIamPrincipalMatch {
    const matched = matches.filter((result) => result.matched);

    return (
      matched.find((result) => !result.isAccountDelegation) ??
      matched[0] ??
      this.none()
    );
  }

  /**
   * A match of the same kind, or none, according to a condition.
   */
  when(matched: boolean): SimIamPrincipalMatch {
    return matched ? this : SimIamPrincipalMatch.none();
  }
}

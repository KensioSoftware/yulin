/**
 * How a resource-policy statement came to apply to the caller.
 *
 * AWS treats these apart. A statement naming the caller's own ARN is a grant
 * to that principal. A statement naming the Account, as a bare account ID or a
 * root ARN, delegates the decision to that Account's IAM and grants nothing by
 * itself. A statement whose principal is a wildcard names nobody. It admits
 * whoever the request came from, and a service calling with the caller's own
 * permissions still needs IAM to allow that caller.
 *
 * A KMS key policy is where the difference shows. It is the whole reason the
 * default key policy leaves a key unusable by the Account's principals until
 * IAM allows them, and the reason the aws/ssm key leaves a SecureString
 * unreadable to a caller holding no kms:Decrypt.
 */
export class SimIamPrincipalMatch {
  /**
   * Whether the statement applies to the caller at all.
   */
  public readonly matched: boolean;

  /**
   * Whether the statement applies by way of the caller's Account.
   */
  public readonly isAccountDelegation: boolean;

  /**
   * Whether the statement named the caller, rather than admitting it as one
   * of a wider set.
   */
  public readonly namesCaller: boolean;

  /**
   * Whether the statement reached an assumed-role session only by naming the
   * Role behind it.
   *
   * AWS limits such a grant by the session's permissions boundary and session
   * policy, and leaves a grant naming the session itself unlimited.
   */
  public readonly isThroughRole: boolean;

  private constructor(
    matched: boolean,
    isAccountDelegation: boolean,
    namesCaller: boolean,
    isThroughRole = false,
  ) {
    this.matched = matched;
    this.isAccountDelegation = isAccountDelegation;
    this.namesCaller = namesCaller;
    this.isThroughRole = isThroughRole;
  }

  /**
   * The statement does not apply to this caller.
   */
  static none(): SimIamPrincipalMatch {
    return new SimIamPrincipalMatch(false, false, false);
  }

  /**
   * The statement names this caller, or applies without naming an Account.
   */
  static direct(): SimIamPrincipalMatch {
    return new SimIamPrincipalMatch(true, false, true);
  }

  /**
   * The statement applies by way of the caller's Account.
   */
  static accountDelegation(): SimIamPrincipalMatch {
    return new SimIamPrincipalMatch(true, true, false);
  }

  /**
   * The statement applies to whoever made the request, naming nobody.
   */
  static everyone(): SimIamPrincipalMatch {
    return new SimIamPrincipalMatch(true, false, false);
  }

  /**
   * The first match among alternatives, since Principal lists are an OR.
   *
   * A statement naming the caller wins over one that admits it some other
   * way, because naming the caller grants to the caller whatever else the
   * statement says.
   */
  static first(matches: readonly SimIamPrincipalMatch[]): SimIamPrincipalMatch {
    const matched = matches.filter((result) => result.matched);

    return (
      matched.find((result) => result.namesCaller && !result.isThroughRole) ??
      matched.find((result) => result.namesCaller) ??
      matched.find((result) => !result.isAccountDelegation) ??
      matched[0] ??
      this.none()
    );
  }

  /**
   * Whether the grant reaches the caller past an implicit deny in its
   * permissions boundary or session policy.
   *
   * A statement naming the caller's own ARN does, and so does a wildcard. A
   * statement naming the Role behind a session, or the caller's Account, is
   * limited by them.
   */
  get passesPrincipalLimits(): boolean {
    return this.matched && !this.isAccountDelegation && !this.isThroughRole;
  }

  /**
   * The same match, reached through the Role behind a session.
   */
  throughRole(): SimIamPrincipalMatch {
    return new SimIamPrincipalMatch(
      this.matched,
      this.isAccountDelegation,
      this.namesCaller,
      true,
    );
  }

  /**
   * A match of the same kind, or none, according to a condition.
   */
  when(matched: boolean): SimIamPrincipalMatch {
    return matched ? this : SimIamPrincipalMatch.none();
  }
}

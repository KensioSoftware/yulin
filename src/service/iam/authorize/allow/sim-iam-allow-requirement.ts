interface SimIamAllowSidesProperties {
  readonly identity: boolean;
  readonly resource: boolean;

  /**
   * Whether a resource-policy Allow named the caller rather than its Account.
   * Defaults to the resource side, for callers with no reason to distinguish.
   */
  readonly resourceDirect?: boolean | undefined;

  /**
   * Whether a resource-policy Allow named the caller, rather than admitting it
   * as one of a wider set through a wildcard principal. Defaults to the
   * resource side in the same way.
   */
  readonly resourceNamesCaller?: boolean | undefined;
}

/**
 * Which sides of a policy evaluation produced a matching Allow.
 *
 * Identity-based policies are the caller's side of a request; resource-based
 * policies are the resource's side. AWS combines the two differently depending
 * on whether the caller and the resource belong to the same Account, so the
 * sides are kept apart rather than counted together.
 */
export class SimIamAllowSides {
  private readonly identityAllowed: boolean;
  private readonly resourceAllowed: boolean;
  private readonly resourceDirectAllowed: boolean;
  private readonly resourceNamesCallerAllowed: boolean;

  constructor(properties: SimIamAllowSidesProperties) {
    this.identityAllowed = properties.identity;
    this.resourceAllowed = properties.resource;
    this.resourceDirectAllowed =
      properties.resourceDirect ?? properties.resource;
    this.resourceNamesCallerAllowed =
      properties.resourceNamesCaller ?? properties.resource;
  }

  /**
   * Whether an identity-based policy allowed the request.
   */
  get identity(): boolean {
    return this.identityAllowed;
  }

  /**
   * Whether a resource-based policy allowed the request.
   */
  get resource(): boolean {
    return this.resourceAllowed;
  }

  /**
   * Whether a resource-based policy allowed the request without delegating to
   * the caller's Account.
   */
  get resourceDirect(): boolean {
    return this.resourceDirectAllowed;
  }

  /**
   * Whether the resource's policy admitted the caller only by delegating to
   * its Account, which grants nothing on its own.
   */
  get resourceDelegated(): boolean {
    return this.resourceAllowed && !this.resourceDirectAllowed;
  }

  /**
   * Whether a resource-based policy allowed the request by naming the caller,
   * rather than by admitting whoever the request came from.
   */
  get resourceNamesCaller(): boolean {
    return this.resourceNamesCallerAllowed;
  }
}

/**
 * Which sides of an authorization must allow a request for it to be allowed.
 */
export interface SimIamAllowRequirement {
  isSatisfiedBy(allows: SimIamAllowSides): boolean;
}

/**
 * The same-Account rule: an Allow from either side is enough.
 *
 * Within one Account an identity policy can allow a request with no resource
 * policy involved, and a resource policy can allow it with no identity policy
 * involved.
 */
export class SimIamEitherSideAllowRequirement implements SimIamAllowRequirement {
  /**
   * Whether either side of the evaluation allowed the request.
   */
  isSatisfiedBy(allows: SimIamAllowSides): boolean {
    return allows.identity || allows.resource;
  }
}

/**
 * The cross-Account rule: both sides must allow.
 *
 * AWS decides a cross-Account request in both Accounts. The caller's Account
 * allows the action through an identity policy, and the resource's Account
 * allows it through a resource policy. Neither side can grant access to the
 * other Account's principals or resources on its own.
 */
export class SimIamBothSidesAllowRequirement implements SimIamAllowRequirement {
  /**
   * Whether both sides of the evaluation allowed the request.
   */
  isSatisfiedBy(allows: SimIamAllowSides): boolean {
    return allows.identity && allows.resource;
  }
}

/**
 * The rule for a resource whose policy is mandatory: it must admit the caller.
 *
 * Most AWS resources have no resource policy until someone writes one, and its
 * absence simply leaves the decision to IAM. A KMS key is not like that: it
 * always has a key policy, and an identity policy cannot reach the key unless
 * that policy admits the caller. Services holding such a resource ask for this
 * rule rather than IAM inferring it, because only the service knows its
 * resource works that way.
 *
 * How the policy admits the caller decides what else is needed. A statement
 * naming the caller grants access outright, which is why a KMS key policy can
 * make a key usable by a Role with no permissions of its own. A statement
 * naming the Account only delegates to that Account's IAM, so an identity
 * policy still has to allow the action. That second case is the one the
 * default key policy creates, and getting it wrong would make every key in the
 * simulation usable by every principal in its Account.
 */
export class SimIamMandatoryResourcePolicyRequirement implements SimIamAllowRequirement {
  /**
   * Whether the resource's own policy admitted the caller, and whether
   * anything further is needed for the way it did so.
   */
  isSatisfiedBy(allows: SimIamAllowSides): boolean {
    if (allows.resourceDirect) {
      return true;
    }

    return allows.resourceDelegated && allows.identity;
  }
}

/**
 * The rule for a request one service makes to another with the caller's own
 * permissions. The caller needs the permission itself.
 *
 * A resource policy naming the caller still allows the request on its own, as
 * a KMS key policy naming a Role does. A policy admitting whoever the request
 * came from does not, because what it admits is the service, and an identity
 * policy has to allow the action as well.
 *
 * Nothing in the simulation asks for this rule. Parameter Store is the case it
 * was written for, and the aws/ssm key policy grants its cryptographic actions
 * to a wildcard principal outright.
 */
export class SimIamCallerPermissionRequirement implements SimIamAllowRequirement {
  /**
   * Whether the caller holds the permission itself, or was named outright by
   * the resource.
   */
  isSatisfiedBy(allows: SimIamAllowSides): boolean {
    return allows.resourceNamesCaller || allows.identity;
  }
}

/**
 * Every applicable rule at once.
 *
 * A request can be subject to more than one: a cross-Account call against a
 * KMS key has to satisfy both the cross-Account rule and the key's own
 * mandatory-policy rule, and the stricter answer is the right one.
 */
export class SimIamEveryAllowRequirement implements SimIamAllowRequirement {
  private readonly requirements: readonly SimIamAllowRequirement[];

  constructor(requirements: readonly SimIamAllowRequirement[]) {
    this.requirements = requirements;
  }

  /**
   * Whether every rule is satisfied.
   */
  isSatisfiedBy(allows: SimIamAllowSides): boolean {
    return this.requirements.every((requirement) =>
      requirement.isSatisfiedBy(allows),
    );
  }
}

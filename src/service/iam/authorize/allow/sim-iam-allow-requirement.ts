interface SimIamAllowSidesProperties {
  readonly identity: boolean;
  readonly resource: boolean;
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

  constructor(properties: SimIamAllowSidesProperties) {
    this.identityAllowed = properties.identity;
    this.resourceAllowed = properties.resource;
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

/**
 * The resource types AWS WAF protects that no simulated request passes
 * through, as ListResourcesForWebACL lists them.
 */
export type SimWafUnsimulatedResourceType =
  | "APPLICATION_LOAD_BALANCER"
  | "APPSYNC"
  | "APP_RUNNER_SERVICE"
  | "VERIFIED_ACCESS_INSTANCE";

interface SimWafUnsimulatedResourceKind {
  readonly resourceType: SimWafUnsimulatedResourceType;
  readonly described: string;
  readonly pattern: RegExp;
}

/**
 * The ARN shapes AWS documents for each of them.
 */
const kinds: readonly SimWafUnsimulatedResourceKind[] = [
  {
    resourceType: "APPLICATION_LOAD_BALANCER",
    described: "an Application Load Balancer",
    pattern:
      /^arn:aws:elasticloadbalancing:[^:]+:[^:]+:loadbalancer\/app\/[^/]+\/[^/]+$/u,
  },
  {
    resourceType: "APPSYNC",
    described: "an AppSync GraphQL API",
    pattern: /^arn:aws:appsync:[^:]+:[^:]+:apis\/[^/]+$/u,
  },
  {
    resourceType: "APP_RUNNER_SERVICE",
    described: "an App Runner service",
    pattern: /^arn:aws:apprunner:[^:]+:[^:]+:service\/[^/]+\/[^/]+$/u,
  },
  {
    resourceType: "VERIFIED_ACCESS_INSTANCE",
    described: "a Verified Access instance",
    pattern: /^arn:aws:ec2:[^:]+:[^:]+:verified-access-instance\/[^/]+$/u,
  },
];

/**
 * The types listed for a resource AWS WAF protects and Yulin does not.
 */
export const simWafUnsimulatedResourceTypes: readonly SimWafUnsimulatedResourceType[] =
  kinds.map((kind) => kind.resourceType);

/**
 * A resource AWS WAF protects and no simulated request passes through.
 *
 * An association with one is held, and GetWebACLForResource and
 * ListResourcesForWebACL report it. Nothing is evaluated in front of it,
 * because nothing here serves a request through it. Whether the resource
 * exists is not checked, since no simulated service holds it to ask.
 */
export class SimWafUnsimulatedResource {
  public readonly resourceType: SimWafUnsimulatedResourceType;
  public readonly arn: string;
  public readonly regionName: string;
  public readonly accountId: string;

  /** Why the web ACL in front of this resource evaluates nothing. */
  public readonly reason: string;

  private constructor(arn: string, kind: SimWafUnsimulatedResourceKind) {
    const [regionName, accountId] = arn.split(":").slice(3, 5);

    this.resourceType = kind.resourceType;
    this.arn = arn;
    this.regionName = String(regionName);
    this.accountId = String(accountId);
    this.reason =
      `AWS WAF protects ${kind.described}, and no simulated request passes ` +
      `through one, so the association with ${arn} is held and nothing in ` +
      `front of it is evaluated`;
  }

  /**
   * The unsimulated resource an ARN names, or nothing when it names none.
   *
   * Every pattern places the Region and the Account where any ARN does, so a
   * match is read for them by position.
   */
  static read(arn: string): SimWafUnsimulatedResource | undefined {
    const kind = kinds.find((candidate) => candidate.pattern.test(arn));

    return kind && new SimWafUnsimulatedResource(arn, kind);
  }
}

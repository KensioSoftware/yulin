import type {
  SimArnPrincipal,
  SimAwsPrincipal,
} from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamRole } from "../../role/sim-iam-role.js";
import type { SimIamSessionPolicy } from "./sim-iam-session-policy.js";

interface SimIamSessionProperties {
  readonly principal: SimArnPrincipal;
  readonly sourcePrincipal: SimAwsPrincipal;
  readonly role: SimIamRole;
  readonly sessionName: string;
  readonly sessionToken: string;
  readonly creationDate: Date;
  readonly expiration: Date;
  readonly sessionPolicies?: readonly SimIamSessionPolicy[] | undefined;
}

/**
 * A temporary simulated AWS session.
 *
 * A session retains both the assumed-role request principal and the underlying
 * IAM Role whose identity policies apply to requests made with the session.
 */
export class SimIamSession {
  public readonly principal: SimArnPrincipal;
  public readonly sourcePrincipal: SimAwsPrincipal;
  public readonly role: SimIamRole;
  public readonly sessionName: string;
  public readonly sessionToken: string;
  public readonly creationDate: Date;
  public readonly expiration: Date;

  /**
   * The policies passed to `AssumeRole`, which cap what the Role's policies
   * grant this session. Undefined where none were passed.
   */
  public readonly sessionPolicies?: readonly SimIamSessionPolicy[] | undefined;

  constructor(properties: SimIamSessionProperties) {
    if (properties.sessionName.length === 0) {
      throw new Error("Sim IAM session name must not be empty");
    }

    if (properties.sessionToken.length === 0) {
      throw new Error("Sim IAM session token must not be empty");
    }

    if (properties.expiration.getTime() <= properties.creationDate.getTime()) {
      throw new Error("Sim IAM session expiration must follow its creation");
    }

    this.principal = properties.principal;
    this.sourcePrincipal = properties.sourcePrincipal;
    this.role = properties.role;
    this.sessionName = properties.sessionName;
    this.sessionToken = properties.sessionToken;
    this.creationDate = new Date(properties.creationDate);
    this.expiration = new Date(properties.expiration);
    this.sessionPolicies = properties.sessionPolicies;
  }

  /**
   * Whether this session has expired at the supplied time.
   */
  isExpired(now: Date): boolean {
    return now.getTime() >= this.expiration.getTime();
  }
}

import type {
  SimArnPrincipal,
  SimAwsPrincipal,
} from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamRole } from "../../role/sim-iam-role.js";

interface SimIamSessionProps {
  readonly principal: SimArnPrincipal;
  readonly sourcePrincipal: SimAwsPrincipal;
  readonly role: SimIamRole;
  readonly sessionName: string;
  readonly sessionToken: string;
  readonly createDate: Date;
  readonly expiration: Date;
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
  public readonly createDate: Date;
  public readonly expiration: Date;

  constructor(props: SimIamSessionProps) {
    if (props.sessionName.length === 0) {
      throw new Error("Sim IAM session name must not be empty");
    }

    if (props.sessionToken.length === 0) {
      throw new Error("Sim IAM session token must not be empty");
    }

    if (props.expiration.getTime() <= props.createDate.getTime()) {
      throw new Error("Sim IAM session expiration must follow its creation");
    }

    this.principal = props.principal;
    this.sourcePrincipal = props.sourcePrincipal;
    this.role = props.role;
    this.sessionName = props.sessionName;
    this.sessionToken = props.sessionToken;
    this.createDate = new Date(props.createDate);
    this.expiration = new Date(props.expiration);
  }

  /**
   * Whether this session has expired at the supplied time.
   */
  isExpired(now: Date): boolean {
    return now.getTime() >= this.expiration.getTime();
  }
}

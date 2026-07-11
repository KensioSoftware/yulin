import { createHash, timingSafeEqual } from "node:crypto";

import type { SimAwsPrincipal } from "../../aws/caller/sim-aws-caller.js";
import type {
  SimAwsCredentials,
  SimIamCredentialIdentity,
} from "./sim-aws-credentials.js";
import type { SimIamSession } from "./session/sim-iam-session.js";

export type SimIamAccessKeyStatus = "Active" | "Inactive";

interface SimIamAccessKeyProps {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly principal: SimAwsPrincipal;
  readonly identityPolicyPrincipal?: SimAwsPrincipal | undefined;
  readonly session?: SimIamSession | undefined;
  readonly createDate?: Date | undefined;
  readonly status?: SimIamAccessKeyStatus | undefined;
}

/**
 * A simulated AWS access key associated with an authenticated principal.
 *
 * Access keys can represent either long-lived credentials or temporary
 * credentials backed by a session.
 */
export class SimIamAccessKey {
  public readonly accessKeyId: string;
  public readonly secretAccessKey: string;
  public readonly principal: SimAwsPrincipal;
  public readonly identityPolicyPrincipal: SimAwsPrincipal;
  public readonly session?: SimIamSession | undefined;
  public readonly createDate: Date;
  public status: SimIamAccessKeyStatus;

  constructor(props: SimIamAccessKeyProps) {
    if (props.accessKeyId.length === 0) {
      throw new Error("Sim IAM access key ID must not be empty");
    }

    if (props.secretAccessKey.length === 0) {
      throw new Error("Sim IAM secret access key must not be empty");
    }

    this.accessKeyId = props.accessKeyId;
    this.secretAccessKey = props.secretAccessKey;
    this.principal = props.principal;
    this.identityPolicyPrincipal =
      props.identityPolicyPrincipal ?? props.principal;
    this.session = props.session;
    this.createDate = new Date(props.createDate ?? Date.now());
    this.status = props.status ?? "Active";
  }

  /**
   * Whether the supplied credential values authenticate this access key.
   */
  matches(credentials: SimAwsCredentials): boolean {
    if (
      credentials.accessKeyId !== this.accessKeyId ||
      !this.matchesSecretAccessKey(credentials.secretAccessKey)
    ) {
      return false;
    }

    if (this.session === undefined) {
      return credentials.sessionToken === undefined;
    }

    return this.matchesSessionToken(credentials.sessionToken);
  }

  /**
   * Whether a secret access key matches this access key.
   */
  matchesSecretAccessKey(secretAccessKey: string): boolean {
    return this.secretsMatch(secretAccessKey, this.secretAccessKey);
  }

  /**
   * Whether a session token matches this access key's temporary session.
   */
  matchesSessionToken(sessionToken: string | undefined): boolean {
    return (
      this.session !== undefined &&
      sessionToken !== undefined &&
      this.secretsMatch(sessionToken, this.session.sessionToken)
    );
  }

  /**
   * Return the authenticated identity represented by this access key.
   */
  identity(): SimIamCredentialIdentity {
    return {
      principal: this.principal,
      identityPolicyPrincipal: this.identityPolicyPrincipal,
      role: this.session?.role,
      session: this.session,
    };
  }

  private secretsMatch(actual: string, expected: string): boolean {
    const actualHash = createHash("sha256").update(actual).digest();
    const expectedHash = createHash("sha256").update(expected).digest();

    return timingSafeEqual(actualHash, expectedHash);
  }
}

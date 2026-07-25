import { createHash, timingSafeEqual } from "node:crypto";

import type { SimAwsPrincipal } from "../../aws/caller/sim-aws-caller.js";
import type { SimIamCredentialIdentity } from "./sim-aws-credentials.js";
import type { SimIamSession } from "./session/sim-iam-session.js";

export type SimIamAccessKeyStatus = "Active" | "Inactive";

interface SimIamAccessKeyProperties {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly principal: SimAwsPrincipal;
  readonly identityPolicyPrincipal?: SimAwsPrincipal | undefined;
  readonly session?: SimIamSession | undefined;
  readonly creationDate?: Date | undefined;
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
  public readonly creationDate: Date;
  public status: SimIamAccessKeyStatus;

  constructor(properties: SimIamAccessKeyProperties) {
    this.accessKeyId = properties.accessKeyId;
    this.secretAccessKey = properties.secretAccessKey;
    this.principal = properties.principal;
    this.identityPolicyPrincipal =
      properties.identityPolicyPrincipal ?? properties.principal;
    this.session = properties.session;
    this.creationDate = new Date(properties.creationDate ?? Date.now());
    this.status = properties.status ?? "Active";
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

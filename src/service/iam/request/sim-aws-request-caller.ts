import type {
  SimAwsCaller,
  SimAwsPrincipal,
} from "../../aws/caller/sim-aws-caller.js";
import { simAwsCallerHeaderValue } from "./sim-aws-caller-header.js";

/**
 * How a request's principal was established.
 *
 * This is reported back to the client, because "who does the simulator think
 * you are" is much less useful without "and why".
 */
export type SimAwsRequestAuthMethod = "caller-header" | "sigv4" | "none";

interface SimAwsRequestCallerProperties {
  readonly principal: SimAwsPrincipal;
  readonly identityPolicyPrincipal?: SimAwsPrincipal | undefined;
  readonly authMethod: SimAwsRequestAuthMethod;
}

/**
 * The principal a request into simulated AWS is attributed to.
 *
 * An unauthenticated request is anonymous and never the Account root. In
 * process an omitted caller means "whoever owns this simulation", which is a
 * convenience; over HTTP the same default would hand administrator rights to
 * anyone who could reach the port, so the boundary refuses to make that
 * assumption.
 *
 * For an assumed-role session the effective principal is the session while
 * `identityPolicyPrincipal` is the Role whose policies apply, exactly as
 * `SimIamCredentialIdentity` distinguishes them.
 */
export class SimAwsRequestCaller {
  public readonly principal: SimAwsPrincipal;
  public readonly identityPolicyPrincipal: SimAwsPrincipal;
  public readonly authMethod: SimAwsRequestAuthMethod;

  constructor(properties: SimAwsRequestCallerProperties) {
    this.principal = properties.principal;
    this.identityPolicyPrincipal =
      properties.identityPolicyPrincipal ?? properties.principal;
    this.authMethod = properties.authMethod;
  }

  /**
   * The caller of a request that carried no identity at all.
   */
  static anonymous(): SimAwsRequestCaller {
    return new SimAwsRequestCaller({
      principal: { kind: "anonymous" },
      authMethod: "none",
    });
  }

  /**
   * The principal in the form the `x-sim-aws-caller` header accepts.
   */
  toHeaderValue(): string {
    return simAwsCallerHeaderValue(this.principal);
  }

  /**
   * This caller in the form simulated services pass to IAM authorization.
   *
   * The identity-policy principal travels with it, so an assumed-role session
   * is authorized against the Role behind it rather than against a session ARN
   * that owns no policies.
   */
  toCaller(): SimAwsCaller {
    return {
      kind: "resolved",
      principal: this.principal,
      identityPolicyPrincipal: this.identityPolicyPrincipal,
    };
  }
}

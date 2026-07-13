import type { SimArn } from "../../aws/arn.js";
import type { SimIamPolicy } from "../policy/sim-iam-policy.js";
import type { SimIamRole, SimIamRoleName } from "../role/sim-iam-role.js";
import {
  SimIamAuthZContextBuilder,
  type SimIamAuthorizationInput,
} from "./context/sim-iam-auth-z-context-builder.js";
import { SimIamPolicyDecision } from "./sim-iam-decision.js";
import type { SimAwsPrincipal } from "../../aws/caller/sim-aws-caller.js";
import type { SimIamUser, SimIamUsername } from "../user/sim-iam-user.js";
import type { SimAwsCredentialIdentityResolver } from "../../aws/caller/sim-aws-caller-resolver.js";

interface SimIamAuthorizerProps {
  readonly policies: ReadonlyMap<SimArn, SimIamPolicy>;
  readonly roles: ReadonlyMap<SimIamRoleName, SimIamRole>;
  readonly users: ReadonlyMap<SimIamUsername, SimIamUser>;
  readonly defaultCallerPrincipal: SimAwsPrincipal;
  readonly credentialIdentityResolver: SimAwsCredentialIdentityResolver;
}

/**
 * Facade for simulated IAM authorization decisions.
 *
 * This class represents the service-facing entry point for IAM authorization.
 * It assembles the authorization context from IAM state and request input, while
 * each SimIamPolicyDecision instance keeps the state and diagnostics for one
 * evaluated authorization attempt.
 */
export class SimIamAuthorizer {
  private readonly contextBuilder: SimIamAuthZContextBuilder;

  constructor(props: SimIamAuthorizerProps) {
    this.contextBuilder = new SimIamAuthZContextBuilder(
      props.policies,
      props.roles,
      props.users,
      props.defaultCallerPrincipal,
      props.credentialIdentityResolver,
    );
  }

  /**
   * Evaluate an IAM authorization request.
   */
  authorize(input: SimIamAuthorizationInput): SimIamPolicyDecision {
    return new SimIamPolicyDecision(this.contextBuilder.build(input));
  }
}

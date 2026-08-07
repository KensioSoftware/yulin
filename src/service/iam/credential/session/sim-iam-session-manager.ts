import { assertDefined } from "../../../../util/type-guard/defined.js";
import { SimIamSession } from "./sim-iam-session.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import type { SimIamRole, SimIamRoleName } from "../../role/sim-iam-role.js";
import type { SimIamCredentialRegistry } from "../sim-iam-credential-registry.js";
import type { SimIamSessionCredentialGenerator } from "./sim-iam-session-cred-gen.js";
import type { SimArnPrincipal } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsCredentials } from "../sim-aws-credentials.js";
import { SimIamAccessKey } from "../sim-iam-access-key.js";
import { SimIamAssumedRolePrincipalFactory } from "./sim-iam-assumed-role-principal-factory.js";

interface SimIamSessionManagerProperties {
  readonly accountId: SimAwsAccountId;
  readonly roles: ReadonlyMap<SimIamRoleName, SimIamRole>;
  readonly credentialRegistry: SimIamCredentialRegistry;
  readonly credentialGenerator: SimIamSessionCredentialGenerator;
}

export interface SimIamCreateRoleSessionInput {
  readonly roleName: SimIamRoleName;
  readonly sessionName: string;
  readonly sourcePrincipal: SimArnPrincipal;
  readonly creationDate: Date;
  readonly expiration: Date;
}

export interface SimIamCreatedRoleSession {
  readonly credentials: SimAwsCredentials;
  readonly session: SimIamSession;
}

/**
 * Creates and registers temporary simulated IAM sessions.
 *
 * This manager owns the coordination between IAM Roles, temporary credentials,
 * sessions, and the credential registry.
 */
export class SimIamSessionManager {
  private readonly roles: ReadonlyMap<SimIamRoleName, SimIamRole>;
  private readonly credentialRegistry: SimIamCredentialRegistry;
  private readonly credentialGenerator: SimIamSessionCredentialGenerator;
  private readonly principalFactory: SimIamAssumedRolePrincipalFactory;

  constructor(properties: SimIamSessionManagerProperties) {
    this.roles = properties.roles;
    this.credentialRegistry = properties.credentialRegistry;
    this.credentialGenerator = properties.credentialGenerator;
    this.principalFactory = new SimIamAssumedRolePrincipalFactory(
      properties.accountId,
    );
  }

  /**
   * Create and register a temporary session for an IAM Role.
   */
  createRoleSession(
    input: SimIamCreateRoleSessionInput,
  ): SimIamCreatedRoleSession {
    const role = this.role(input.roleName);
    const credentials = this.credentialGenerator.generate();
    const principal = this.principalFactory.make(role, input.sessionName);
    const session = new SimIamSession({
      principal,
      sourcePrincipal: input.sourcePrincipal,
      role,
      sessionName: input.sessionName,
      sessionToken: credentials.sessionToken,
      creationDate: input.creationDate,
      expiration: input.expiration,
    });

    this.credentialRegistry.registerAccessKey(
      new SimIamAccessKey({
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        principal,
        identityPolicyPrincipal: {
          kind: "arn",
          arn: role.arn,
        },
        session,
        creationDate: input.creationDate,
      }),
    );

    return {
      credentials,
      session,
    };
  }

  private role(roleName: SimIamRoleName): SimIamRole {
    const role = this.roles.get(roleName);

    assertDefined(role, `Sim IAM Role ${roleName} does not exist`);

    return role;
  }
}

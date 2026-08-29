import { jsonStringify } from "../../../util/type-guard/json.js";
import type { SimArnPrincipal } from "../../aws/caller/sim-aws-caller.js";
import type {
  SimPutRolePolicyCommand,
  SimPutRolePolicyCommandOutput,
} from "../command/policy/put-role-policy/put-role-policy.command.js";
import type {
  SimCreateRoleCommand,
  SimCreateRoleCommandOutput,
} from "../command/role/create-role/create-role.command.js";
import type { SimIamPolicyDocument } from "../policy/sim-iam-policy.js";

/**
 * A permissions policy for a deploy Role.
 *
 * The parsed document a CDK app answers with, or the JSON string a template,
 * a file or the SDK carries it as.
 */
export type SimIamDeployRolePolicy = SimIamPolicyDocument | string;

/**
 * What making a Role for a deployment to run as takes.
 */
export interface SimIamDeployRoleInput {
  /**
   * The name to create the Role under.
   */
  readonly roleName: string;

  /**
   * What the deployment is allowed to do.
   *
   * Several documents go on the Role as several inline policies. A policy
   * split in two to stay under IAM's size cap is passed on whole.
   */
  readonly policyDocument:
    | SimIamDeployRolePolicy
    | readonly SimIamDeployRolePolicy[];
}

/**
 * The IAM commands making a deploy Role takes.
 */
interface SimIamDeployRoleCommands {
  createRole(
    command: SimCreateRoleCommand,
  ): Promise<SimCreateRoleCommandOutput>;
  putRolePolicy(
    command: SimPutRolePolicyCommand,
  ): Promise<SimPutRolePolicyCommandOutput>;
}

/**
 * The trust a Role needs for CloudFormation to deploy as it.
 */
const deploymentTrustPolicy = jsonStringify({
  Version: "2012-10-17",
  Statement: {
    Effect: "Allow",
    Principal: { Service: "cloudformation.amazonaws.com" },
    Action: "sts:AssumeRole",
  },
});

/**
 * Makes the Role a simulated CloudFormation deployment runs as.
 *
 * A project that scopes its own deploy permissions has the policy document
 * already and wants a caller to pass to `deployTemplate`, `deployTemplateFile`
 * or `deployCdkOut`. Getting from one to the other is a Role with the trust
 * CloudFormation needs, the document on it, and the Role's ARN. The trust is
 * the same every time and the ARN follows from the name. Neither is asked for.
 */
export class SimIamDeployRoleMaker {
  private readonly commands: SimIamDeployRoleCommands;

  constructor(commands: SimIamDeployRoleCommands) {
    this.commands = commands;
  }

  /**
   * Create the Role and answer with the caller a deployment names it by.
   *
   * Each document goes on as an inline policy of its own, under a numbered
   * name. A policy split in two to fit IAM's cap has no second name of its
   * own.
   */
  async make(input: SimIamDeployRoleInput): Promise<SimArnPrincipal> {
    const creation = await this.commands.createRole({
      input: {
        RoleName: input.roleName,
        AssumeRolePolicyDocument: deploymentTrustPolicy,
      },
    });

    await Promise.all(
      [input.policyDocument].flat().map((document, index) =>
        this.commands.putRolePolicy({
          input: {
            RoleName: input.roleName,
            PolicyName: `${input.roleName}-policy-${index + 1}`,
            PolicyDocument:
              typeof document === "string" ? document : jsonStringify(document),
          },
        }),
      ),
    );

    return { kind: "arn", arn: creation.Role.Arn };
  }
}

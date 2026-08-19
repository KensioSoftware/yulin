import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimIam } from "../../sim-iam.js";
import type { SimIamUser, SimIamUsername } from "../../user/sim-iam-user.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import {
  SimCfnIamUserPropertiesParser,
  type SimCfnIamUserProperties,
} from "./sim-cfn-iam-user-properties-parser.js";

interface SimCfnIamUserCreatorProperties {
  readonly iam: SimIam;
}

/**
 * Creates simulated IAM Users from CloudFormation Resources.
 */
export class SimCfnIamUserCreator {
  private readonly iam: SimIam;
  private readonly propsParser = new SimCfnIamUserPropertiesParser();

  constructor(properties: SimCfnIamUserCreatorProperties) {
    this.iam = properties.iam;
  }

  /**
   * Create a simulated User from an AWS::IAM::User Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<SimIamUser> {
    const userProperties = this.propsParser.parse(resource, properties);

    await this.iam.createUser({
      input: {
        UserName: userProperties.userName,
        Path: userProperties.path,
      },
    });

    await Promise.all([
      this.putInlinePolicies(userProperties),
      this.attachManagedPolicies(userProperties),
      this.createLoginProfile(userProperties),
    ]);

    const user = this.iam.users.get(userProperties.userName as SimIamUsername);
    assertDefined(
      user,
      `Sim IAM User ${userProperties.userName} after CloudFormation creation`,
    );

    return user;
  }

  private async putInlinePolicies(
    userProperties: SimCfnIamUserProperties,
  ): Promise<void> {
    await Promise.all(
      userProperties.inlinePolicies.map(async (inlinePolicy) =>
        this.iam.putUserPolicy({
          input: {
            UserName: userProperties.userName,
            PolicyName: inlinePolicy.policyName,
            PolicyDocument: inlinePolicy.policyDocument,
          },
        }),
      ),
    );
  }

  private async attachManagedPolicies(
    userProperties: SimCfnIamUserProperties,
  ): Promise<void> {
    await Promise.all(
      userProperties.managedPolicyArns.map(async (policyArn) =>
        this.iam.attachUserPolicy({
          input: {
            UserName: userProperties.userName,
            PolicyArn: policyArn,
          },
        }),
      ),
    );
  }

  /**
   * Give the User a console password, the way real CloudFormation calls
   * CreateLoginProfile for a `LoginProfile` property.
   */
  private async createLoginProfile(
    userProperties: SimCfnIamUserProperties,
  ): Promise<void> {
    const { loginProfile } = userProperties;

    if (loginProfile === undefined) {
      return;
    }

    await this.iam.createLoginProfile({
      input: {
        UserName: userProperties.userName,
        Password: loginProfile.password,
        PasswordResetRequired: loginProfile.passwordResetRequired,
      },
    });
  }
}

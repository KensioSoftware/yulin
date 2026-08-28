import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCognitoIdentityProvider } from "../../sim-cognito-identity-provider.js";
import type { SimCognitoGroup } from "../../user-pool/group/sim-cognito-group.js";
import { SimCfnCognitoGroupProperties } from "./sim-cfn-cognito-group-properties.js";
import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";

interface SimCfnCognitoGroupCreatorProperties {
  readonly cognito: SimCognitoIdentityProvider;
}

/**
 * Creates simulated groups from AWS::Cognito::UserPoolGroup Resources.
 *
 * The group goes through the ordinary CreateGroup command, so the group name
 * is validated and a name already in the pool is refused, as they are for an
 * SDK caller.
 */
export class SimCfnCognitoGroupCreator {
  private readonly cognito: SimCognitoIdentityProvider;

  constructor(properties: SimCfnCognitoGroupCreatorProperties) {
    this.cognito = properties.cognito;
  }

  /**
   * Create a group from an AWS::Cognito::UserPoolGroup Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    options?: SimCfnResourceCallerOptions,
  ): Promise<SimCognitoGroup> {
    const groupProperties = new SimCfnCognitoGroupProperties({
      resource,
      properties,
    });
    const groupName = groupProperties.groupName();

    await this.cognito.createGroup(
      { input: groupProperties.createGroupInput() },
      options,
    );

    const group = this.cognito
      .userPool(groupProperties.userPoolId())
      .findGroup(groupName);
    assertDefined(
      group,
      `sim Cognito group ${groupName} after CloudFormation creation`,
    );

    return group;
  }
}

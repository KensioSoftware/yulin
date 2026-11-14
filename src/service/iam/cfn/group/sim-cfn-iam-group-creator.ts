import { assertDefined } from "../../../../util/type-guard/defined.js";

import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type {
  SimIamGroup,
  SimIamGroupName,
} from "../../group/sim-iam-group.js";
import type { SimIam } from "../../sim-iam.js";
import { simCfnIamPrincipalGeneratedName } from "../name/sim-cfn-iam-generated-name.js";
import { SimCfnIamPoliciesParser } from "../sim-cfn-iam-policies-parser.js";
import {
  simCfnIamNameList,
  simCfnIamOptionalString,
} from "../sim-cfn-iam-property.js";

const resourceType = "AWS::IAM::Group";

/**
 * Creates and deletes simulated IAM groups for AWS::IAM::Group Resources, and
 * adds Users to them for AWS::IAM::UserToGroupAddition Resources.
 */
export class SimCfnIamGroupCreator {
  private readonly policiesParser = new SimCfnIamPoliciesParser({
    resourceType,
  });

  constructor(private readonly iam: SimIam) {}

  /**
   * Create a group, with the inline and managed policies its template gives.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    options?: SimCfnResourceCallerOptions,
  ): Promise<SimIamGroup> {
    const string = (label: string): string | undefined =>
      simCfnIamOptionalString({
        resourceType,
        resource,
        // oxlint-disable-next-line security/detect-object-injection -- fixed property names.
        value: properties[label],
        label,
      });
    const GroupName =
      string("GroupName") ?? simCfnIamPrincipalGeneratedName(resource);
    const inlinePolicies = this.policiesParser.inlinePolicies(
      resource,
      properties,
    );
    const managedPolicyArns = this.policiesParser.managedPolicyArns(
      resource,
      properties,
    );

    await this.iam.createGroup(
      { input: { GroupName, Path: string("Path") } },
      options,
    );
    await Promise.all([
      ...inlinePolicies.map(async ({ policyName, policyDocument }) =>
        this.iam.putGroupPolicy(
          {
            input: {
              GroupName,
              PolicyName: policyName,
              PolicyDocument: policyDocument,
            },
          },
          options,
        ),
      ),
      ...managedPolicyArns.map(async (PolicyArn) =>
        this.iam.attachGroupPolicy(
          { input: { GroupName, PolicyArn } },
          options,
        ),
      ),
    ]);

    const group = this.iam.groups.get(GroupName as SimIamGroupName);
    assertDefined(group, `Sim IAM group ${GroupName} after creation`);

    return group;
  }

  /**
   * Delete a group, taking off the policies the Stack gave it first.
   */
  async delete(
    resource: SimCfnResource,
    options?: SimCfnResourceCallerOptions,
  ): Promise<void> {
    const group = resource.simResource as SimIamGroup | undefined;
    assertDefined(
      group,
      `sim IAM group for CloudFormation Resource ${resource.logicalId}`,
    );
    const GroupName = group.groupName;

    await Promise.all([
      ...group.inlinePolicies
        .keys()
        .map(async (PolicyName) =>
          this.iam.deleteGroupPolicy(
            { input: { GroupName, PolicyName } },
            options,
          ),
        ),
      ...[...group.attachedPolicyArns].map(async (PolicyArn) =>
        this.iam.detachGroupPolicy(
          { input: { GroupName, PolicyArn } },
          options,
        ),
      ),
    ]);
    await this.iam.deleteGroup({ input: { GroupName } }, options);
  }

  /**
   * Add each User an AWS::IAM::UserToGroupAddition names to its group, or take
   * each back out.
   */
  async membership(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    request: {
      readonly join: boolean;
      readonly options?: SimCfnResourceCallerOptions | undefined;
    },
  ): Promise<void> {
    const additionType = "AWS::IAM::UserToGroupAddition";
    const GroupName = simCfnIamOptionalString({
      resourceType: additionType,
      resource,
      value: properties["GroupName"],
      label: "GroupName",
    });
    assertDefined(GroupName, `${additionType} ${resource.logicalId} GroupName`);
    const users = simCfnIamNameList({
      resourceType: additionType,
      resource,
      value: properties["Users"],
      label: "Users",
    });

    await Promise.all(
      users.map(async (username) => {
        const input = { input: { GroupName, UserName: username } };

        await (request.join
          ? this.iam.addUserToGroup(input, request.options)
          : this.iam.removeUserFromGroup(input, request.options));
      }),
    );
  }
}

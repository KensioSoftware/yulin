import type { SimAws } from "../../aws/sim-aws.js";
import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import {
  SimCfnOrganizationsAccount,
  SimCfnOrganizationsPolicy,
} from "./sim-cfn-organizations-record.js";
import { SimOrganizationsOrganizationalUnit } from "../tree/sim-organizations-node.js";

/**
 * Takes back what an `AWS::Organizations::*` Resource did.
 *
 * A Stack tears down in reverse dependency order, so a policy comes off before
 * the unit it was attached to goes, and a unit goes before the root it hung
 * on. Each Resource here undoes its own step and nothing else.
 */
export class SimCfnOrganizationsRemover {
  readonly #simAws: SimAws;

  constructor(simAws: SimAws) {
    this.#simAws = simAws;
  }

  /**
   * Undo one Resource.
   */
  remove(resourceTypeName: string, resource: SimCfnResource): void {
    const simResource = resource.simResource;
    const organizations = this.#simAws.organizations();

    if (simResource instanceof SimCfnOrganizationsPolicy) {
      for (const targetId of simResource.targetIds) {
        organizations.detachServiceControlPolicy(targetId, simResource.id);
      }

      return;
    }

    if (simResource instanceof SimCfnOrganizationsAccount) {
      organizations.removeAccount(simResource.accountId);

      return;
    }

    if (simResource instanceof SimOrganizationsOrganizationalUnit) {
      organizations.removeOrganizationalUnit(simResource);

      return;
    }

    if (resourceTypeName !== "Organization") {
      throw new Error(
        `Unsupported sim Organizations CloudFormation Resource ` +
          `${resourceTypeName} deletion`,
      );
    }
  }
}

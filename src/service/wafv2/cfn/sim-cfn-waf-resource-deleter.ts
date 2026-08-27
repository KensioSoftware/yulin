import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimWafIpSet } from "../ip-set/sim-waf-ip-set.js";
import type { SimWafRegexPatternSet } from "../regex-pattern-set/sim-waf-regex-pattern-set.js";
import type { SimWafWebAcl } from "../web-acl/sim-waf-web-acl.js";
import type { SimWafCfnWebAclAssociation } from "./association/sim-cfn-waf-web-acl-association.js";
import {
  type SimCfnWafCreators,
  unsupportedSimWafResourceType,
} from "./sim-cfn-waf-creators.js";
import {
  wafIpSetResourceTypeName,
  wafRegexPatternSetResourceTypeName,
  wafWebAclAssociationResourceTypeName,
  wafWebAclResourceTypeName,
} from "./sim-cfn-waf-resource-types.js";
import type { SimCfnResourceCallerOptions } from "../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";

/**
 * Deletes the simulated WAFv2 resources a CloudFormation Stack created.
 *
 * Each Resource is deleted through what CloudFormation held for it rather than
 * by reading its template again. A web ACL is asked for by name, id and lock
 * token, and an association by the resource ARN it was made against, and both
 * of those come off the thing that was created.
 */
export class SimCfnWafResourceDeleter {
  readonly #creators: SimCfnWafCreators;

  constructor(properties: { readonly creators: SimCfnWafCreators }) {
    this.#creators = properties.creators;
  }

  /**
   * Delete one simulated WAFv2 Resource.
   */
  async delete(
    resourceTypeName: string,
    resource: SimCfnResource,
    options?: SimCfnResourceCallerOptions,
  ): Promise<void> {
    const creators = this.#creators;

    switch (resourceTypeName) {
      case wafWebAclResourceTypeName: {
        await creators.webAcl.delete(
          resource,
          created<SimWafWebAcl>(resource, "web ACL"),
          options,
        );
        return;
      }
      case wafWebAclAssociationResourceTypeName: {
        await creators.association.delete(
          resource,
          created<SimWafCfnWebAclAssociation>(resource, "web ACL association"),
          options,
        );
        return;
      }
      case wafIpSetResourceTypeName: {
        await creators.ipSet.delete(
          resource,
          created<SimWafIpSet>(resource, "IP set"),
          options,
        );
        return;
      }
      case wafRegexPatternSetResourceTypeName: {
        await creators.regexPatternSet.delete(
          resource,
          created<SimWafRegexPatternSet>(resource, "regex pattern set"),
          options,
        );
        return;
      }
      default: {
        throw unsupportedSimWafResourceType(resourceTypeName, " deletion");
      }
    }
  }
}

/**
 * What CloudFormation held for a Resource, which a deletion cannot do without.
 */
function created<T extends object>(
  resource: SimCfnResource,
  described: string,
): T {
  const simResource = resource.simResource as T | undefined;

  assertDefined(
    simResource,
    `sim WAFv2 ${described} for CloudFormation Resource ${resource.logicalId}`,
  );

  return simResource;
}

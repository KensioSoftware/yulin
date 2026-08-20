import type { SimWafV2 } from "../sim-wafv2.js";
import { SimCfnWafAssociationCreator } from "./association/sim-cfn-waf-association-creator.js";
import { SimCfnWafIpSetCreator } from "./ip-set/sim-cfn-waf-ip-set-creator.js";
import { SimCfnWafRegexPatternSetCreator } from "./regex-pattern-set/sim-cfn-waf-regex-set-creator.js";
import { SimCfnWafWebAclCreator } from "./web-acl/sim-cfn-waf-web-acl-creator.js";

/**
 * The creator behind each simulated WAFv2 Resource type.
 *
 * Both halves of the CloudFormation lifecycle need all four, because each
 * creator owns the deletion of what it made as well as the making of it, so
 * the set is built once here and handed to the factory and its deleter.
 */
export interface SimCfnWafCreators {
  readonly webAcl: SimCfnWafWebAclCreator;
  readonly association: SimCfnWafAssociationCreator;
  readonly ipSet: SimCfnWafIpSetCreator;
  readonly regexPatternSet: SimCfnWafRegexPatternSetCreator;
}

/**
 * Build the creators for one simulated WAFv2.
 */
export function simCfnWafCreators(wafV2: SimWafV2): SimCfnWafCreators {
  return {
    webAcl: new SimCfnWafWebAclCreator({ wafV2 }),
    association: new SimCfnWafAssociationCreator({ wafV2 }),
    ipSet: new SimCfnWafIpSetCreator({ wafV2 }),
    regexPatternSet: new SimCfnWafRegexPatternSetCreator({ wafV2 }),
  };
}

/**
 * The error a Resource type this factory does not model is refused with.
 *
 * Sim CloudFormation reads it as a Resource to record and step over, which is
 * the right answer for a rule group or a logging configuration: neither has
 * anything behind it here, and a stack declaring one says so in its skipped
 * Resources rather than failing.
 */
export function unsupportedSimWafResourceType(
  resourceTypeName: string,
  operationSuffix: string,
): Error {
  return new Error(
    `Unsupported sim WAFv2 CloudFormation Resource ` +
      `${resourceTypeName}${operationSuffix}`,
  );
}

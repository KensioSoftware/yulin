import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimWafAssociations } from "./association/sim-waf-associations.js";
import {
  SimWafNoProtectedResources,
  type SimWafProtectedResources,
} from "./association/sim-waf-protected-resources.js";
import { SimWafAssociationAccess } from "./command/association/sim-wafv2-association-access.js";
import { SimWafAssociationCommands } from "./command/association/sim-wafv2-association-commands.js";
import { SimWafAuthorizer } from "./command/authorize/sim-wafv2-authorizer.js";
import { SimWafIpSetCommands } from "./command/ip-set/sim-wafv2-ip-set-commands.js";
import { SimWafManagedRuleGroupCommands } from "./command/managed-rule-group/sim-wafv2-managed-rule-group-commands.js";
import { SimWafRegexPatternSetCommands } from "./command/regex-pattern-set/sim-wafv2-regex-pattern-set-commands.js";
import { SimWafWebAclCommands } from "./command/web-acl/sim-wafv2-web-acl-commands.js";
import type { SimWafIpSet } from "./ip-set/sim-waf-ip-set.js";
import { SimWafManagedRules } from "./managed/sim-waf-managed-rules.js";
import type { SimWafRegexPatternSet } from "./regex-pattern-set/sim-waf-regex-pattern-set.js";
import { SimWafResourceStore } from "./resource/sim-waf-resource-store.js";
import type { SimWafWebAcl } from "./web-acl/sim-waf-web-acl.js";

export interface SimWafV2Properties {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
  /**
   * The resources this WAFv2 can put a web ACL in front of. A standalone
   * simulated WAFv2 has none, so an association names a resource that is not
   * there rather than protecting something imaginary.
   */
  readonly protectedResources?: SimWafProtectedResources;
}

/**
 * The collaborators one simulated WAFv2 scope is built from.
 *
 * Held apart from SimWafV2 for the reason simulated SES holds its own: the
 * facade is one method per SDK Command and grows by one with every operation
 * added, so the wiring deciding what those methods delegate to needs somewhere
 * it is not competing for room with them.
 */
export class SimWafCommands {
  readonly webAcls = new SimWafResourceStore<SimWafWebAcl>("web ACL");
  readonly ipSets = new SimWafResourceStore<SimWafIpSet>("IP set");
  readonly regexPatternSets = new SimWafResourceStore<SimWafRegexPatternSet>(
    "regex pattern set",
  );

  /**
   * The web ACLs this scope has in front of things.
   *
   * Held here rather than in the association commands because a served request
   * reaches it without a Command, the way a fronting service reaches AWS WAF.
   */
  readonly associations = new SimWafAssociations();

  readonly managedRules = new SimWafManagedRules();

  readonly webAclCommands: SimWafWebAclCommands;
  readonly associationCommands: SimWafAssociationCommands;
  readonly managedRuleGroupCommands: SimWafManagedRuleGroupCommands;
  readonly ipSetCommands: SimWafIpSetCommands;
  readonly regexPatternSetCommands: SimWafRegexPatternSetCommands;
  readonly background: BackgroundScheduler;

  constructor(properties: SimWafV2Properties = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
      protectedResources = new SimWafNoProtectedResources(),
    } = properties;

    const authorizer = new SimWafAuthorizer({ iam });

    this.background = background;
    this.webAclCommands = new SimWafWebAclCommands({
      webAcls: this.webAcls,
      regexPatternSets: this.regexPatternSets,
      associations: this.associations,
      managedRules: this.managedRules,
      authorizer,
      accountRegionScope,
      // The background scheduler is this simulation's source of time as well
      // as its scheduler, and a rate-based rule counts against it.
      clock: background,
    });
    this.managedRuleGroupCommands = new SimWafManagedRuleGroupCommands({
      authorizer,
      accountRegionScope,
    });
    this.associationCommands = new SimWafAssociationCommands({
      associations: this.associations,
      access: new SimWafAssociationAccess({
        webAcls: this.webAcls,
        protectedResources,
        authorizer,
        accountRegionScope,
      }),
    });
    this.ipSetCommands = new SimWafIpSetCommands({
      ipSets: this.ipSets,
      authorizer,
      accountRegionScope,
    });
    this.regexPatternSetCommands = new SimWafRegexPatternSetCommands({
      regexPatternSets: this.regexPatternSets,
      authorizer,
      accountRegionScope,
    });
  }
}

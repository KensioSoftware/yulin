import type { SimClock } from "../../../../util/clock/sim-clock.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimWafAssociations } from "../../association/sim-waf-associations.js";
import { SimWafAssociatedItemException } from "../../error/sim-wafv2.error.js";
import type { SimWafManagedRules } from "../../managed/sim-waf-managed-rules.js";
import type { SimWafRegexPatternSet } from "../../regex-pattern-set/sim-waf-regex-pattern-set.js";
import type { SimWafResourceStore } from "../../resource/sim-waf-resource-store.js";
import { requiredSimWafScope } from "../../scope/sim-waf-scope.js";
import type { SimWafWebAclConfiguration } from "../../web-acl/sim-waf-web-acl-configuration.js";
import { SimWafWebAcl } from "../../web-acl/sim-waf-web-acl.js";
import type { SimWafAuthorizer } from "../authorize/sim-wafv2-authorizer.js";
import { SimWafPage } from "../sim-wafv2-page.js";
import {
  checkedSimWafDescription,
  requiredSimWafName,
} from "../sim-wafv2-input.js";
import {
  requireSimWafResource,
  type SimWafResourceInput,
} from "../sim-wafv2-resource-lookup.js";
import type { SimWafRequestOptions } from "../sim-wafv2-request-options.js";
import { refuseUnsimulatedSimWafWebAclInput } from "./sim-wafv2-unsimulated-web-acl-input.js";
import { simWafWebAclOutput } from "./sim-waf-web-acl-output.js";
import type {
  SimCreateWebAclCommand,
  SimCreateWebAclCommandOutput,
  SimDeleteWebAclCommand,
  SimDeleteWebAclCommandOutput,
  SimGetWebAclCommand,
  SimGetWebAclCommandOutput,
  SimListWebAclsCommand,
  SimListWebAclsCommandOutput,
  SimUpdateWebAclCommand,
  SimUpdateWebAclCommandOutput,
  SimWafWebAclWriteInput,
} from "./web-acl.command.js";

interface SimWafWebAclCommandsProperties {
  readonly webAcls: SimWafResourceStore<SimWafWebAcl>;
  readonly regexPatternSets: SimWafResourceStore<SimWafRegexPatternSet>;
  readonly associations: SimWafAssociations;
  readonly managedRules: SimWafManagedRules;
  readonly authorizer: SimWafAuthorizer;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly clock: SimClock;
}

/**
 * The commands that make, read, list, change and remove web ACLs.
 *
 * Every rule is compiled where the web ACL is written, so a statement kind
 * this simulation cannot evaluate is refused by CreateWebACL and UpdateWebACL
 * rather than by the request that would have been let through.
 */
export class SimWafWebAclCommands {
  readonly #webAcls: SimWafResourceStore<SimWafWebAcl>;
  readonly #regexPatternSets: SimWafResourceStore<SimWafRegexPatternSet>;
  readonly #associations: SimWafAssociations;
  readonly #managedRules: SimWafManagedRules;
  readonly #authorizer: SimWafAuthorizer;
  readonly #accountRegionScope: SimAwsAccountRegionScope;
  readonly #clock: SimClock;

  constructor(properties: SimWafWebAclCommandsProperties) {
    this.#webAcls = properties.webAcls;
    this.#regexPatternSets = properties.regexPatternSets;
    this.#associations = properties.associations;
    this.#managedRules = properties.managedRules;
    this.#authorizer = properties.authorizer;
    this.#accountRegionScope = properties.accountRegionScope;
    this.#clock = properties.clock;
  }

  /**
   * Make a web ACL from a default action and a list of rules.
   */
  createWebAcl(
    command: SimCreateWebAclCommand,
    options?: SimWafRequestOptions,
  ): SimCreateWebAclCommandOutput {
    const { input } = command;
    const name = requiredSimWafName(input.Name);
    const scope = requiredSimWafScope(
      input.Scope,
      this.#accountRegionScope.regionName,
    );

    refuseUnsimulatedSimWafWebAclInput(input, "CreateWebACL");

    const configuration = configurationOf(input);
    const webAcl = new SimWafWebAcl({
      name,
      scope,
      accountRegionScope: this.#accountRegionScope,
      description: configuration.description,
      configuration,
      regexPatternSets: this.#regexPatternSets,
      managedRules: this.#managedRules,
      clock: this.#clock,
    });

    this.#authorizer.authorizeResource(
      "wafv2:CreateWebACL",
      webAcl.arn,
      options?.caller,
    );

    return { $metadata: {}, Summary: this.#webAcls.add(webAcl).summary() };
  }

  /**
   * Read one web ACL and the token the next write to it has to present.
   */
  getWebAcl(
    command: SimGetWebAclCommand,
    options?: SimWafRequestOptions,
  ): SimGetWebAclCommandOutput {
    const webAcl = this.require(command.input, "wafv2:GetWebACL", options);

    return {
      $metadata: {},
      LockToken: webAcl.lockToken,
      WebACL: simWafWebAclOutput(webAcl),
    };
  }

  /**
   * Write a new default action and set of rules over a web ACL.
   */
  updateWebAcl(
    command: SimUpdateWebAclCommand,
    options?: SimWafRequestOptions,
  ): SimUpdateWebAclCommandOutput {
    const { input } = command;

    refuseUnsimulatedSimWafWebAclInput(input, "UpdateWebACL");

    const configuration = configurationOf(input);
    const webAcl = this.require(input, "wafv2:UpdateWebACL", options);

    webAcl.reconfigure(configuration, input.LockToken);

    return { $metadata: {}, NextLockToken: webAcl.lockToken };
  }

  /**
   * List the web ACLs in one scope, in the order they were created.
   *
   * Real WAFv2 gives this action no resource type at all, so it authorizes
   * against `*`: a policy scoped to web ACL ARNs allows no listing, however
   * broadly those ARNs are written.
   */
  listWebAcls(
    command: SimListWebAclsCommand,
    options?: SimWafRequestOptions,
  ): SimListWebAclsCommandOutput {
    const scope = requiredSimWafScope(
      command.input.Scope,
      this.#accountRegionScope.regionName,
    );

    this.#authorizer.authorizeNoResource("wafv2:ListWebACLs", options?.caller);

    const page = new SimWafPage({
      listed: this.#webAcls.all(scope),
      limit: command.input.Limit,
      nextMarker: command.input.NextMarker,
    });

    return {
      $metadata: {},
      WebACLs: page.items.map((webAcl) => webAcl.summary()),
      NextMarker: page.nextMarker,
    };
  }

  /**
   * Remove a web ACL.
   *
   * A web ACL still in front of something is refused. Deleting one would
   * otherwise leave a stage protected by rules nothing holds any more, so the
   * resources it protects are disassociated first.
   */
  deleteWebAcl(
    command: SimDeleteWebAclCommand,
    options?: SimWafRequestOptions,
  ): SimDeleteWebAclCommandOutput {
    const webAcl = this.require(command.input, "wafv2:DeleteWebACL", options);
    const associated = this.#associations.resourceArnsFor(webAcl);

    if (associated.length > 0) {
      throw new SimWafAssociatedItemException(
        `AWS WAF couldn't perform the operation because your resource is ` +
          `being used by another resource or it's associated with another ` +
          `resource: web ACL ${webAcl.name} is associated with ` +
          `${associated.join(", ")}.`,
      );
    }

    webAcl.takeLock(command.input.LockToken);
    this.#webAcls.remove(webAcl);

    return { $metadata: {} };
  }

  /**
   * Find a web ACL a request named, once its caller is authorized for it.
   */
  private require(
    input: SimWafResourceInput,
    action: string,
    options: SimWafRequestOptions | undefined,
  ): SimWafWebAcl {
    return requireSimWafResource({
      store: this.#webAcls,
      input,
      kind: "webacl",
      action,
      authorizer: this.#authorizer,
      accountRegionScope: this.#accountRegionScope,
      caller: options?.caller,
    });
  }
}

function configurationOf(
  input: SimWafWebAclWriteInput,
): SimWafWebAclConfiguration {
  return {
    defaultAction: input.DefaultAction,
    rules: input.Rules,
    customResponseBodies: input.CustomResponseBodies,
    visibilityConfig: input.VisibilityConfig,
    description: checkedSimWafDescription(input.Description),
    associationConfig: input.AssociationConfig,
  };
}

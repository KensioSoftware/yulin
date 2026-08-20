import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimWafManagedRules } from "../../managed/sim-waf-managed-rules.js";
import type { SimWafRegexPatternSet } from "../../regex-pattern-set/sim-waf-regex-pattern-set.js";
import type { SimWafResourceStore } from "../../resource/sim-waf-resource-store.js";
import { requiredSimWafScope } from "../../scope/sim-waf-scope.js";
import type { SimWafWebAclConfiguration } from "../../web-acl/sim-waf-web-acl-configuration.js";
import { SimWafWebAcl } from "../../web-acl/sim-waf-web-acl.js";
import type { SimWafAuthorizer } from "../authorize/sim-wafv2-authorizer.js";
import { SimWafPage } from "../sim-wafv2-page.js";
import { requiredSimWafName } from "../sim-wafv2-input.js";
import {
  requireSimWafResource,
  type SimWafResourceInput,
} from "../sim-wafv2-resource-lookup.js";
import type { SimWafRequestOptions } from "../sim-wafv2-request-options.js";
import { refuseUnsimulatedSimWafWebAclInput } from "./sim-wafv2-unsimulated-web-acl-input.js";
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
  readonly managedRules: SimWafManagedRules;
  readonly authorizer: SimWafAuthorizer;
  readonly accountRegionScope: SimAwsAccountRegionScope;
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
  readonly #managedRules: SimWafManagedRules;
  readonly #authorizer: SimWafAuthorizer;
  readonly #accountRegionScope: SimAwsAccountRegionScope;

  constructor(properties: SimWafWebAclCommandsProperties) {
    this.#webAcls = properties.webAcls;
    this.#regexPatternSets = properties.regexPatternSets;
    this.#managedRules = properties.managedRules;
    this.#authorizer = properties.authorizer;
    this.#accountRegionScope = properties.accountRegionScope;
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

    const webAcl = new SimWafWebAcl({
      name,
      scope,
      accountRegionScope: this.#accountRegionScope,
      description: input.Description,
      configuration: configurationOf(input),
      regexPatternSets: this.#regexPatternSets,
      managedRules: this.#managedRules,
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
    const { configuration } = webAcl;

    return {
      $metadata: {},
      LockToken: webAcl.lockToken,
      WebACL: {
        Name: webAcl.name,
        Id: webAcl.id,
        ARN: webAcl.arn,
        Description: webAcl.description,
        DefaultAction: configuration.defaultAction,
        Rules: configuration.rules ?? [],
        VisibilityConfig: configuration.visibilityConfig,
        CustomResponseBodies: configuration.customResponseBodies,
      },
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

    const webAcl = this.require(input, "wafv2:UpdateWebACL", options);

    webAcl.reconfigure(configurationOf(input), input.LockToken);

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
   */
  deleteWebAcl(
    command: SimDeleteWebAclCommand,
    options?: SimWafRequestOptions,
  ): SimDeleteWebAclCommandOutput {
    const webAcl = this.require(command.input, "wafv2:DeleteWebACL", options);

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
    description: input.Description,
  };
}

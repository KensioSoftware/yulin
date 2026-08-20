import type { SimSdkCommandRouter } from "../../sdk/router/sim-sdk-command-router.type.js";
import type * as simWafCommands from "./command/sim-wafv2-command.types.js";
import type { SimWafRequestOptions } from "./command/sim-wafv2-request-options.js";
import { SimWafNonexistentItemException } from "./error/sim-wafv2.error.js";
import type { SimWafDecision } from "./evaluate/sim-waf-decision.js";
import type { SimWafEvaluationRequest } from "./evaluate/sim-waf-evaluation-request.js";
import { simWafInspectedRequest } from "./evaluate/sim-waf-inspected-request.js";
import type { SimWafManagedRules } from "./managed/sim-waf-managed-rules.js";
import type { SimWafScope } from "./scope/sim-waf-scope.js";
import { SimWafSdkCommandRouter } from "./sdk/sim-wafv2-sdk-command-router.js";
import {
  SimWafCommands,
  type SimWafV2Properties,
} from "./sim-wafv2-commands.js";
import type { SimWafWebAcl } from "./web-acl/sim-waf-web-acl.js";

export type { SimWafEvaluationRequest } from "./evaluate/sim-waf-evaluation-request.js";

/**
 * Simulated AWS WAFv2. Handles SDK commands. Emulates AWS behaviour and state.
 *
 * A web ACL is a list of rules and a decision about the requests none of them
 * claims, and `evaluateRequest` is what that adds up to. Association with a
 * CloudFront distribution, an API Gateway stage or a Cognito user pool comes
 * separately: this holds the rules and reaches the verdict, and the fronting
 * services will ask it for one.
 *
 * Resources are scoped to an Account and Region, and within that to
 * `CLOUDFRONT` or `REGIONAL`. The two scopes are separate namespaces rather
 * than a label, and `CLOUDFRONT` lives in `us-east-1` because CloudFront is
 * global and its web ACLs are held there.
 */
export class SimWafV2 {
  readonly #commands: SimWafCommands;
  readonly #sdkRouter = new SimWafSdkCommandRouter(this);

  constructor(properties: SimWafV2Properties = {}) {
    this.#commands = new SimWafCommands(properties);
  }

  /**
   * Every web ACL in one scope, in the order they were created.
   *
   * The simulator's own accessor, for tests inspecting web ACL state without
   * going through a Command and its authorization.
   */
  allWebAcls(scope: SimWafScope): readonly SimWafWebAcl[] {
    return this.#commands.webAcls.all(scope);
  }

  /**
   * Find a web ACL by its ARN.
   *
   * This is how a fronting service reaches the web ACL it was associated with,
   * since an association carries the ARN and nothing else.
   */
  findWebAclByArn(webAclArn: string): SimWafWebAcl | undefined {
    return this.#commands.webAcls.findByArn(webAclArn);
  }

  /**
   * Evaluate one HTTP request against a web ACL's rules.
   *
   * Rules run in ascending priority, the first terminating match decides, and
   * a request no rule terminates gets the web ACL's default action. This is
   * the simulator's own entry point rather than a WAFv2 operation: on AWS the
   * evaluation happens because the request reached something the web ACL is in
   * front of.
   */
  evaluateRequest(evaluation: SimWafEvaluationRequest): SimWafDecision {
    const webAcl = this.findWebAclByArn(evaluation.webAclArn);

    if (webAcl === undefined) {
      throw new SimWafNonexistentItemException(
        `AWS WAF couldn't perform the operation because your resource ` +
          `doesn't exist: web ACL ${evaluation.webAclArn}.`,
      );
    }

    return webAcl.evaluate(
      simWafInspectedRequest(evaluation.request, evaluation.body),
    );
  }

  /**
   * What the AWS managed rule groups do here, and what a test declares of
   * them.
   *
   * `onRequest` says which rules claim a request, for the ones that detect
   * nothing here, and `rules()` reports what is covered of each.
   */
  managedRules(): SimWafManagedRules {
    return this.#commands.managedRules;
  }

  /**
   * Handle a CreateWebACL Command from the SDK.
   */
  async createWebAcl(
    command: simWafCommands.SimCreateWebAclCommand,
    options?: SimWafRequestOptions,
  ): Promise<simWafCommands.SimCreateWebAclCommandOutput> {
    await this.#commands.background.sequence();
    return this.#commands.webAclCommands.createWebAcl(command, options);
  }

  /**
   * Handle a GetWebACL Command from the SDK.
   */
  async getWebAcl(
    command: simWafCommands.SimGetWebAclCommand,
    options?: SimWafRequestOptions,
  ): Promise<simWafCommands.SimGetWebAclCommandOutput> {
    await this.#commands.background.sequence();
    return this.#commands.webAclCommands.getWebAcl(command, options);
  }

  /**
   * Handle an UpdateWebACL Command from the SDK.
   */
  async updateWebAcl(
    command: simWafCommands.SimUpdateWebAclCommand,
    options?: SimWafRequestOptions,
  ): Promise<simWafCommands.SimUpdateWebAclCommandOutput> {
    await this.#commands.background.sequence();
    return this.#commands.webAclCommands.updateWebAcl(command, options);
  }

  /**
   * Handle a ListWebACLs Command from the SDK.
   */
  async listWebAcls(
    command: simWafCommands.SimListWebAclsCommand,
    options?: SimWafRequestOptions,
  ): Promise<simWafCommands.SimListWebAclsCommandOutput> {
    await this.#commands.background.sequence();
    return this.#commands.webAclCommands.listWebAcls(command, options);
  }

  /**
   * Handle a DeleteWebACL Command from the SDK.
   */
  async deleteWebAcl(
    command: simWafCommands.SimDeleteWebAclCommand,
    options?: SimWafRequestOptions,
  ): Promise<simWafCommands.SimDeleteWebAclCommandOutput> {
    await this.#commands.background.sequence();
    return this.#commands.webAclCommands.deleteWebAcl(command, options);
  }

  /**
   * Handle a DescribeManagedRuleGroup Command from the SDK.
   */
  async describeManagedRuleGroup(
    command: simWafCommands.SimDescribeManagedRuleGroupCommand,
    options?: SimWafRequestOptions,
  ): Promise<simWafCommands.SimDescribeManagedRuleGroupCommandOutput> {
    await this.#commands.background.sequence();
    return this.#commands.managedRuleGroupCommands.describeManagedRuleGroup(
      command,
      options,
    );
  }

  /**
   * Handle a CreateIPSet Command from the SDK.
   */
  async createIpSet(
    command: simWafCommands.SimCreateIpSetCommand,
    options?: SimWafRequestOptions,
  ): Promise<simWafCommands.SimCreateIpSetCommandOutput> {
    await this.#commands.background.sequence();
    return this.#commands.ipSetCommands.createIpSet(command, options);
  }

  /**
   * Handle a GetIPSet Command from the SDK.
   */
  async getIpSet(
    command: simWafCommands.SimGetIpSetCommand,
    options?: SimWafRequestOptions,
  ): Promise<simWafCommands.SimGetIpSetCommandOutput> {
    await this.#commands.background.sequence();
    return this.#commands.ipSetCommands.getIpSet(command, options);
  }

  /**
   * Handle an UpdateIPSet Command from the SDK.
   */
  async updateIpSet(
    command: simWafCommands.SimUpdateIpSetCommand,
    options?: SimWafRequestOptions,
  ): Promise<simWafCommands.SimUpdateIpSetCommandOutput> {
    await this.#commands.background.sequence();
    return this.#commands.ipSetCommands.updateIpSet(command, options);
  }

  /**
   * Handle a ListIPSets Command from the SDK.
   */
  async listIpSets(
    command: simWafCommands.SimListIpSetsCommand,
    options?: SimWafRequestOptions,
  ): Promise<simWafCommands.SimListIpSetsCommandOutput> {
    await this.#commands.background.sequence();
    return this.#commands.ipSetCommands.listIpSets(command, options);
  }

  /**
   * Handle a DeleteIPSet Command from the SDK.
   */
  async deleteIpSet(
    command: simWafCommands.SimDeleteIpSetCommand,
    options?: SimWafRequestOptions,
  ): Promise<simWafCommands.SimDeleteIpSetCommandOutput> {
    await this.#commands.background.sequence();
    return this.#commands.ipSetCommands.deleteIpSet(command, options);
  }

  /**
   * Handle a CreateRegexPatternSet Command from the SDK.
   */
  async createRegexPatternSet(
    command: simWafCommands.SimCreateRegexPatternSetCommand,
    options?: SimWafRequestOptions,
  ): Promise<simWafCommands.SimCreateRegexPatternSetCommandOutput> {
    await this.#commands.background.sequence();
    return this.#commands.regexPatternSetCommands.createRegexPatternSet(
      command,
      options,
    );
  }

  /**
   * Handle a GetRegexPatternSet Command from the SDK.
   */
  async getRegexPatternSet(
    command: simWafCommands.SimGetRegexPatternSetCommand,
    options?: SimWafRequestOptions,
  ): Promise<simWafCommands.SimGetRegexPatternSetCommandOutput> {
    await this.#commands.background.sequence();
    return this.#commands.regexPatternSetCommands.getRegexPatternSet(
      command,
      options,
    );
  }

  /**
   * Handle an UpdateRegexPatternSet Command from the SDK.
   */
  async updateRegexPatternSet(
    command: simWafCommands.SimUpdateRegexPatternSetCommand,
    options?: SimWafRequestOptions,
  ): Promise<simWafCommands.SimUpdateRegexPatternSetCommandOutput> {
    await this.#commands.background.sequence();
    return this.#commands.regexPatternSetCommands.updateRegexPatternSet(
      command,
      options,
    );
  }

  /**
   * Handle a ListRegexPatternSets Command from the SDK.
   */
  async listRegexPatternSets(
    command: simWafCommands.SimListRegexPatternSetsCommand,
    options?: SimWafRequestOptions,
  ): Promise<simWafCommands.SimListRegexPatternSetsCommandOutput> {
    await this.#commands.background.sequence();
    return this.#commands.regexPatternSetCommands.listRegexPatternSets(
      command,
      options,
    );
  }

  /**
   * Handle a DeleteRegexPatternSet Command from the SDK.
   */
  async deleteRegexPatternSet(
    command: simWafCommands.SimDeleteRegexPatternSetCommand,
    options?: SimWafRequestOptions,
  ): Promise<simWafCommands.SimDeleteRegexPatternSetCommandOutput> {
    await this.#commands.background.sequence();
    return this.#commands.regexPatternSetCommands.deleteRegexPatternSet(
      command,
      options,
    );
  }

  /**
   * Get this service's SDK Command router for SDK client interception.
   */
  sdkCommandRouter(): SimSdkCommandRouter {
    return this.#sdkRouter;
  }
}

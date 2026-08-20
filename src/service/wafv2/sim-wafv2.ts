import type { SimSdkCommandRouter } from "../../sdk/router/sim-sdk-command-router.type.js";
import type { SimWafProtection } from "./association/sim-waf-protection.js";
import type * as simWafCommands from "./command/sim-wafv2-command.types.js";
import type { SimWafRequestOptions } from "./command/sim-wafv2-request-options.js";
import { SimWafNonexistentItemException } from "./error/sim-wafv2.error.js";
import type { SimWafDecision } from "./evaluate/sim-waf-decision.js";
import { simWafInspectedRequest } from "./evaluate/sim-waf-inspected-request.js";
import type { SimWafScope } from "./scope/sim-waf-scope.js";
import { SimWafSdkCommandRouter } from "./sdk/sim-wafv2-sdk-command-router.js";
import {
  SimWafCommands,
  type SimWafV2Properties,
} from "./sim-wafv2-commands.js";
import { SimWafSets } from "./sim-wafv2-sets.js";
import type { SimWafWebAcl } from "./web-acl/sim-waf-web-acl.js";

/**
 * What a web ACL is asked to decide about.
 */
export interface SimWafEvaluationRequest {
  /** The web ACL to evaluate against, by ARN. */
  readonly webAclArn: string;

  readonly request: Request;

  /**
   * The request body, when the rules might inspect it. A request body is a
   * stream that cannot be read twice, so it is passed in already buffered.
   */
  readonly body?: Uint8Array | undefined;
}

/**
 * Simulated AWS WAFv2. Handles SDK commands. Emulates AWS behaviour and state.
 *
 * A web ACL is a list of rules and a decision about the requests none of them
 * claims, and `evaluateRequest` is what that adds up to. `AssociateWebACL`
 * puts one in front of an API Gateway REST API stage, and the stage then asks
 * for that decision itself on every request it serves.
 *
 * Resources are scoped to an Account and Region, and within that to
 * `CLOUDFRONT` or `REGIONAL`. The two scopes are separate namespaces rather
 * than a label, and `CLOUDFRONT` lives in `us-east-1` because CloudFront is
 * global and its web ACLs are held there.
 */
export class SimWafV2 extends SimWafSets {
  readonly #sdkRouter = new SimWafSdkCommandRouter(this);

  constructor(properties: SimWafV2Properties = {}) {
    super(new SimWafCommands(properties));
  }

  /**
   * The web ACLs this WAFv2 has in front of things, as a fronting service sees
   * them.
   *
   * The simulator's own accessor rather than a WAFv2 operation. It is how a
   * simulated API Gateway reaches the web ACL protecting a stage it is about
   * to serve, and how it lets go of one when the stage is deleted.
   */
  protection(): SimWafProtection {
    return this.commands.associations;
  }

  /**
   * Every web ACL in one scope, in the order they were created.
   *
   * The simulator's own accessor, for tests inspecting web ACL state without
   * going through a Command and its authorization.
   */
  allWebAcls(scope: SimWafScope): readonly SimWafWebAcl[] {
    return this.commands.webAcls.all(scope);
  }

  /**
   * Find a web ACL by its ARN.
   *
   * This is how a fronting service reaches the web ACL it was associated with,
   * since an association carries the ARN and nothing else.
   */
  findWebAclByArn(webAclArn: string): SimWafWebAcl | undefined {
    return this.commands.webAcls.findByArn(webAclArn);
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
   * Handle a CreateWebACL Command from the SDK.
   */
  async createWebAcl(
    command: simWafCommands.SimCreateWebAclCommand,
    options?: SimWafRequestOptions,
  ): Promise<simWafCommands.SimCreateWebAclCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.webAclCommands.createWebAcl(command, options);
  }

  /**
   * Handle a GetWebACL Command from the SDK.
   */
  async getWebAcl(
    command: simWafCommands.SimGetWebAclCommand,
    options?: SimWafRequestOptions,
  ): Promise<simWafCommands.SimGetWebAclCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.webAclCommands.getWebAcl(command, options);
  }

  /**
   * Handle an UpdateWebACL Command from the SDK.
   */
  async updateWebAcl(
    command: simWafCommands.SimUpdateWebAclCommand,
    options?: SimWafRequestOptions,
  ): Promise<simWafCommands.SimUpdateWebAclCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.webAclCommands.updateWebAcl(command, options);
  }

  /**
   * Handle a ListWebACLs Command from the SDK.
   */
  async listWebAcls(
    command: simWafCommands.SimListWebAclsCommand,
    options?: SimWafRequestOptions,
  ): Promise<simWafCommands.SimListWebAclsCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.webAclCommands.listWebAcls(command, options);
  }

  /**
   * Handle a DeleteWebACL Command from the SDK.
   */
  async deleteWebAcl(
    command: simWafCommands.SimDeleteWebAclCommand,
    options?: SimWafRequestOptions,
  ): Promise<simWafCommands.SimDeleteWebAclCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.webAclCommands.deleteWebAcl(command, options);
  }

  /**
   * Handle an AssociateWebACL Command from the SDK.
   */
  async associateWebAcl(
    command: simWafCommands.SimAssociateWebAclCommand,
    options?: SimWafRequestOptions,
  ): Promise<simWafCommands.SimAssociateWebAclCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.associationCommands.associateWebAcl(command, options);
  }

  /**
   * Handle a DisassociateWebACL Command from the SDK.
   */
  async disassociateWebAcl(
    command: simWafCommands.SimDisassociateWebAclCommand,
    options?: SimWafRequestOptions,
  ): Promise<simWafCommands.SimDisassociateWebAclCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.associationCommands.disassociateWebAcl(
      command,
      options,
    );
  }

  /**
   * Handle a GetWebACLForResource Command from the SDK.
   */
  async getWebAclForResource(
    command: simWafCommands.SimGetWebAclForResourceCommand,
    options?: SimWafRequestOptions,
  ): Promise<simWafCommands.SimGetWebAclForResourceCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.associationCommands.getWebAclForResource(
      command,
      options,
    );
  }

  /**
   * Handle a ListResourcesForWebACL Command from the SDK.
   */
  async listResourcesForWebAcl(
    command: simWafCommands.SimListResourcesForWebAclCommand,
    options?: SimWafRequestOptions,
  ): Promise<simWafCommands.SimListResourcesForWebAclCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.associationCommands.listResourcesForWebAcl(
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

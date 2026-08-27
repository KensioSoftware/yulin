import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import { SimWafRegexPatternSet } from "../../regex-pattern-set/sim-waf-regex-pattern-set.js";
import type { SimWafResourceStore } from "../../resource/sim-waf-resource-store.js";
import { requiredSimWafScope } from "../../scope/sim-waf-scope.js";
import type { SimWafAuthorizer } from "../authorize/sim-wafv2-authorizer.js";
import { SimWafPage } from "../sim-wafv2-page.js";
import {
  checkedSimWafDescription,
  refuseSimWafTags,
  requiredSimWafName,
} from "../sim-wafv2-input.js";
import type { SimWafRequestOptions } from "../sim-wafv2-request-options.js";
import { requireSimWafResource } from "../sim-wafv2-resource-lookup.js";
import type {
  SimUpdateRegexPatternSetCommand,
  SimUpdateRegexPatternSetCommandOutput,
  SimCreateRegexPatternSetCommand,
  SimCreateRegexPatternSetCommandOutput,
  SimDeleteRegexPatternSetCommand,
  SimDeleteRegexPatternSetCommandOutput,
  SimGetRegexPatternSetCommand,
  SimGetRegexPatternSetCommandOutput,
  SimListRegexPatternSetsCommand,
  SimListRegexPatternSetsCommandOutput,
} from "./regex-pattern-set.command.js";

interface SimWafRegexPatternSetCommandsProperties {
  readonly regexPatternSets: SimWafResourceStore<SimWafRegexPatternSet>;
  readonly authorizer: SimWafAuthorizer;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * The commands that make, read, list and remove regex pattern sets.
 *
 * A set is what a `RegexPatternSetReferenceStatement` points at, so these are
 * the one resource here besides the web ACL that takes part in evaluating a
 * request.
 */
export class SimWafRegexPatternSetCommands {
  readonly #regexPatternSets: SimWafResourceStore<SimWafRegexPatternSet>;
  readonly #authorizer: SimWafAuthorizer;
  readonly #accountRegionScope: SimAwsAccountRegionScope;

  constructor(properties: SimWafRegexPatternSetCommandsProperties) {
    this.#regexPatternSets = properties.regexPatternSets;
    this.#authorizer = properties.authorizer;
    this.#accountRegionScope = properties.accountRegionScope;
  }

  /**
   * Make a regex pattern set from a list of expressions.
   */
  createRegexPatternSet(
    command: SimCreateRegexPatternSetCommand,
    options?: SimWafRequestOptions,
  ): SimCreateRegexPatternSetCommandOutput {
    const { input } = command;

    refuseSimWafTags(input.Tags, "CreateRegexPatternSet");

    const patternSet = new SimWafRegexPatternSet({
      name: requiredSimWafName(input.Name),
      scope: requiredSimWafScope(
        input.Scope,
        this.#accountRegionScope.regionName,
      ),
      accountRegionScope: this.#accountRegionScope,
      description: checkedSimWafDescription(input.Description),
      regularExpressions: input.RegularExpressionList ?? [],
    });

    this.#authorizer.authorizeResource(
      "wafv2:CreateRegexPatternSet",
      patternSet.arn,
      options?.caller,
    );

    return {
      $metadata: {},
      Summary: this.#regexPatternSets.add(patternSet).summary(),
    };
  }

  /**
   * Read one regex pattern set and the token the next write to it has to
   * present.
   */
  getRegexPatternSet(
    command: SimGetRegexPatternSetCommand,
    options?: SimWafRequestOptions,
  ): SimGetRegexPatternSetCommandOutput {
    const patternSet = this.require(
      command.input,
      "wafv2:GetRegexPatternSet",
      options,
    );

    return {
      $metadata: {},
      LockToken: patternSet.lockToken,
      RegexPatternSet: {
        Name: patternSet.name,
        Id: patternSet.id,
        ARN: patternSet.arn,
        Description: patternSet.description,
        RegularExpressionList: patternSet.regularExpressions.map((pattern) => ({
          RegexString: pattern,
        })),
      },
    };
  }

  /**
   * Write a new list of expressions over a regex pattern set.
   *
   * A rule pointing at the set follows it, because a reference resolves to the
   * set and reads its expressions when a request arrives.
   */
  updateRegexPatternSet(
    command: SimUpdateRegexPatternSetCommand,
    options?: SimWafRequestOptions,
  ): SimUpdateRegexPatternSetCommandOutput {
    const { input } = command;
    const description = checkedSimWafDescription(input.Description);
    const patternSet = this.require(
      input,
      "wafv2:UpdateRegexPatternSet",
      options,
    );

    patternSet.replaceExpressions({
      regularExpressions: input.RegularExpressionList ?? [],
      description,
      lockToken: input.LockToken,
    });

    return { $metadata: {}, NextLockToken: patternSet.lockToken };
  }

  /**
   * List the regex pattern sets in one scope, in the order they were created.
   */
  listRegexPatternSets(
    command: SimListRegexPatternSetsCommand,
    options?: SimWafRequestOptions,
  ): SimListRegexPatternSetsCommandOutput {
    const scope = requiredSimWafScope(
      command.input.Scope,
      this.#accountRegionScope.regionName,
    );

    this.#authorizer.authorizeNoResource(
      "wafv2:ListRegexPatternSets",
      options?.caller,
    );

    const page = new SimWafPage({
      listed: this.#regexPatternSets.all(scope),
      limit: command.input.Limit,
      nextMarker: command.input.NextMarker,
    });

    return {
      $metadata: {},
      RegexPatternSets: page.items.map((patternSet) => patternSet.summary()),
      NextMarker: page.nextMarker,
    };
  }

  /**
   * Remove a regex pattern set.
   */
  deleteRegexPatternSet(
    command: SimDeleteRegexPatternSetCommand,
    options?: SimWafRequestOptions,
  ): SimDeleteRegexPatternSetCommandOutput {
    const patternSet = this.require(
      command.input,
      "wafv2:DeleteRegexPatternSet",
      options,
    );

    patternSet.takeLock(command.input.LockToken);
    this.#regexPatternSets.remove(patternSet);

    return { $metadata: {} };
  }

  private require(
    input: SimGetRegexPatternSetCommand["input"],
    action: string,
    options: SimWafRequestOptions | undefined,
  ): SimWafRegexPatternSet {
    return requireSimWafResource({
      store: this.#regexPatternSets,
      input,
      kind: "regexpatternset",
      action,
      authorizer: this.#authorizer,
      accountRegionScope: this.#accountRegionScope,
      caller: options?.caller,
    });
  }
}

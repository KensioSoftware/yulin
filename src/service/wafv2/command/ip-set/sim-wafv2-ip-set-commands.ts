import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import {
  SimWafIpSet,
  requiredSimWafIpAddressVersion,
} from "../../ip-set/sim-waf-ip-set.js";
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
  SimUpdateIpSetCommand,
  SimUpdateIpSetCommandOutput,
  SimCreateIpSetCommand,
  SimCreateIpSetCommandOutput,
  SimDeleteIpSetCommand,
  SimDeleteIpSetCommandOutput,
  SimGetIpSetCommand,
  SimGetIpSetCommandOutput,
  SimListIpSetsCommand,
  SimListIpSetsCommandOutput,
} from "./ip-set.command.js";

interface SimWafIpSetCommandsProperties {
  readonly ipSets: SimWafResourceStore<SimWafIpSet>;
  readonly authorizer: SimWafAuthorizer;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * The commands that make, read, list and remove IP sets.
 *
 * The addresses are held and reported and nothing evaluates them, because
 * `IPSetReferenceStatement` is refused: every request in this simulation comes
 * from 127.0.0.1.
 */
export class SimWafIpSetCommands {
  readonly #ipSets: SimWafResourceStore<SimWafIpSet>;
  readonly #authorizer: SimWafAuthorizer;
  readonly #accountRegionScope: SimAwsAccountRegionScope;

  constructor(properties: SimWafIpSetCommandsProperties) {
    this.#ipSets = properties.ipSets;
    this.#authorizer = properties.authorizer;
    this.#accountRegionScope = properties.accountRegionScope;
  }

  /**
   * Make an IP set from a list of address ranges.
   */
  createIpSet(
    command: SimCreateIpSetCommand,
    options?: SimWafRequestOptions,
  ): SimCreateIpSetCommandOutput {
    const { input } = command;

    refuseSimWafTags(input.Tags, "CreateIPSet");

    const ipSet = new SimWafIpSet({
      name: requiredSimWafName(input.Name),
      scope: requiredSimWafScope(
        input.Scope,
        this.#accountRegionScope.regionName,
      ),
      accountRegionScope: this.#accountRegionScope,
      description: checkedSimWafDescription(input.Description),
      ipAddressVersion: requiredSimWafIpAddressVersion(input.IPAddressVersion),
      addresses: input.Addresses ?? [],
    });

    this.#authorizer.authorizeResource(
      "wafv2:CreateIPSet",
      ipSet.arn,
      options?.caller,
    );

    return { $metadata: {}, Summary: this.#ipSets.add(ipSet).summary() };
  }

  /**
   * Read one IP set and the token the next write to it has to present.
   */
  getIpSet(
    command: SimGetIpSetCommand,
    options?: SimWafRequestOptions,
  ): SimGetIpSetCommandOutput {
    const ipSet = this.require(command.input, "wafv2:GetIPSet", options);

    return {
      $metadata: {},
      LockToken: ipSet.lockToken,
      IPSet: {
        Name: ipSet.name,
        Id: ipSet.id,
        ARN: ipSet.arn,
        Description: ipSet.description,
        IPAddressVersion: ipSet.ipAddressVersion,
        Addresses: ipSet.addresses,
      },
    };
  }

  /**
   * Write a new list of ranges over an IP set.
   */
  updateIpSet(
    command: SimUpdateIpSetCommand,
    options?: SimWafRequestOptions,
  ): SimUpdateIpSetCommandOutput {
    const { input } = command;
    const description = checkedSimWafDescription(input.Description);
    const ipSet = this.require(input, "wafv2:UpdateIPSet", options);

    ipSet.replaceAddresses({
      addresses: input.Addresses ?? [],
      description,
      lockToken: input.LockToken,
    });

    return { $metadata: {}, NextLockToken: ipSet.lockToken };
  }

  /**
   * List the IP sets in one scope, in the order they were created.
   */
  listIpSets(
    command: SimListIpSetsCommand,
    options?: SimWafRequestOptions,
  ): SimListIpSetsCommandOutput {
    const scope = requiredSimWafScope(
      command.input.Scope,
      this.#accountRegionScope.regionName,
    );

    this.#authorizer.authorizeNoResource("wafv2:ListIPSets", options?.caller);

    const page = new SimWafPage({
      listed: this.#ipSets.all(scope),
      limit: command.input.Limit,
      nextMarker: command.input.NextMarker,
    });

    return {
      $metadata: {},
      IPSets: page.items.map((ipSet) => ipSet.summary()),
      NextMarker: page.nextMarker,
    };
  }

  /**
   * Remove an IP set.
   */
  deleteIpSet(
    command: SimDeleteIpSetCommand,
    options?: SimWafRequestOptions,
  ): SimDeleteIpSetCommandOutput {
    const ipSet = this.require(command.input, "wafv2:DeleteIPSet", options);

    ipSet.takeLock(command.input.LockToken);
    this.#ipSets.remove(ipSet);

    return { $metadata: {} };
  }

  private require(
    input: SimGetIpSetCommand["input"],
    action: string,
    options: SimWafRequestOptions | undefined,
  ): SimWafIpSet {
    return requireSimWafResource({
      store: this.#ipSets,
      input,
      kind: "ipset",
      action,
      authorizer: this.#authorizer,
      accountRegionScope: this.#accountRegionScope,
      caller: options?.caller,
    });
  }
}

import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimAws } from "../../aws/sim-aws.js";
import type { JSONValue } from "../../../util/type-guard/json.js";
import {
  assumeSimStatesExecutionRole,
  simStatesExecutionRoleTarget,
} from "./sim-states-execution-role.js";
import type {
  SimStatesTaskInvocation,
  SimStatesTaskTargets,
} from "./sim-states-task-invocation.js";

interface SimAwsStatesTaskTargetsProperties {
  readonly simAws: SimAws;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * Everywhere the state machines of one simulated AWS instance can reach.
 *
 * What a task calls is looked up when it runs, never when this is built:
 * reaching another service while this one is being constructed is a cycle with
 * no bottom to it.
 *
 * This owns the execution role and nothing else. Which function, table, topic,
 * queue or bus a task talks to is the target's own business, and a target in
 * another Account or Region is allowed, since a real execution reaches across
 * both.
 */
export class SimAwsStatesTaskTargets implements SimStatesTaskTargets {
  readonly #simAws: SimAws;
  readonly #accountRegionScope: SimAwsAccountRegionScope;

  constructor(properties: SimAwsStatesTaskTargetsProperties) {
    this.#simAws = properties.simAws;
    this.#accountRegionScope = properties.accountRegionScope;
  }

  /**
   * Assume the state machine's execution role, then do the task's work as that
   * role.
   *
   * The role is assumed in its own Account, and that is not always the state
   * machine's. Every call the task goes on to make carries the session that
   * makes. Simulated IAM answers each of them against the role's policies.
   */
  async invoke(invocation: SimStatesTaskInvocation): Promise<JSONValue> {
    const { stateName, target } = invocation;
    const role = simStatesExecutionRoleTarget(invocation.roleArn, stateName);
    const roleScope = this.#simAws.accountRegionScope(
      role.accountId,
      this.#accountRegionScope.regionName,
    );
    const caller = await assumeSimStatesExecutionRole(role, roleScope);

    return await target.run({
      stateName,
      payload: invocation.payload,
      caller,
      simAws: this.#simAws,
      scope: this.#accountRegionScope,
    });
  }
}

import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimAws } from "../../aws/sim-aws.js";
import type { JSONValue } from "../../../util/type-guard/json.js";
import {
  assumeSimStatesExecutionRole,
  simStatesExecutionRoleTarget,
} from "./sim-states-execution-role.js";
import { simStatesFunctionLocation } from "./sim-states-function-location.js";
import { SimStatesTaskFunction } from "./sim-states-task-function.js";
import type {
  SimStatesTaskInvocation,
  SimStatesTaskTargets,
} from "./sim-states-task-invocation.js";

interface SimAwsStatesTaskTargetsProperties {
  readonly simAws: SimAws;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * Everywhere the state machines of one simulated AWS instance can invoke.
 *
 * The function is looked up when a task runs, never when this is built:
 * reaching another service while this one is being constructed is a cycle with
 * no bottom to it.
 *
 * A function in another Account or Region is allowed, since a real execution
 * invokes across both, and it is the function's own Account that decides
 * whether the execution role may.
 */
export class SimAwsStatesTaskTargets implements SimStatesTaskTargets {
  readonly #simAws: SimAws;
  readonly #accountRegionScope: SimAwsAccountRegionScope;

  constructor(properties: SimAwsStatesTaskTargetsProperties) {
    this.#simAws = properties.simAws;
    this.#accountRegionScope = properties.accountRegionScope;
  }

  /**
   * Assume the state machine's execution role, then invoke the function as
   * that role.
   *
   * The role is assumed in its own Account, and the function is reached in the
   * function's, which are not necessarily the same one.
   */
  async invoke(invocation: SimStatesTaskInvocation): Promise<JSONValue> {
    const { stateName, target } = invocation;
    const call = target.call(invocation.payload, stateName);
    const where = simStatesFunctionLocation(
      call.functionNameOrArn,
      this.#accountRegionScope,
      stateName,
    );
    const role = simStatesExecutionRoleTarget(invocation.roleArn, stateName);
    const iam = this.#simAws
      .accountRegionScope(role.accountId, where.regionName)
      .iam();

    const caller = await assumeSimStatesExecutionRole(role, iam);
    const scope = this.#simAws.accountRegionScope(
      where.accountId,
      where.regionName,
    );

    return await new SimStatesTaskFunction({ scope }).invoke({
      stateName,
      target,
      reference: where.reference,
      named: call.functionNameOrArn,
      payload: call.payload,
      caller,
    });
  }
}

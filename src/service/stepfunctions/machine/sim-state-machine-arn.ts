import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";

const arnPartition = "aws";
const arnService = "states";

/**
 * Where one state machine is, in the three facts its ARN carries.
 */
export interface SimStateMachineLocation {
  readonly regionName: string;
  readonly accountId: string;
  readonly name: string;
}

/**
 * The ARN of a state machine of a given name in an Account and Region.
 */
export function simStateMachineArn(
  accountRegionScope: SimAwsAccountRegionScope,
  name: string,
): string {
  const { regionName, accountId } = accountRegionScope;

  return `arn:${arnPartition}:${arnService}:${regionName}:${accountId}:stateMachine:${name}`;
}

/**
 * The ARN of one execution of a state machine.
 *
 * A `states` ARN separates its resource parts with colons rather than the
 * slash most services use, so an execution ARN carries the state machine name
 * and the execution name as two more colon-separated parts.
 */
export function simStatesExecutionArn(
  accountRegionScope: SimAwsAccountRegionScope,
  stateMachineName: string,
  executionName: string,
): string {
  const { regionName, accountId } = accountRegionScope;

  return `arn:${arnPartition}:${arnService}:${regionName}:${accountId}:execution:${stateMachineName}:${executionName}`;
}

/**
 * Read a state machine ARN into the Region, Account and name it carries.
 *
 * Nothing is answered for a string that is not one. An ARN naming another
 * Account or Region reaches nothing in this scope rather than having its name
 * read out and looked up locally.
 */
export function parseSimStateMachineArn(
  value: string,
): SimStateMachineLocation | undefined {
  const parts = value.split(":");

  if (parts.length !== 7) {
    return undefined;
  }

  const [prefix, partition, service, regionName, accountId, kind, name] = parts;

  if (
    prefix !== "arn" ||
    partition !== arnPartition ||
    service !== arnService ||
    kind !== "stateMachine" ||
    regionName === undefined ||
    regionName === "" ||
    accountId === undefined ||
    accountId === "" ||
    name === undefined ||
    name === ""
  ) {
    return undefined;
  }

  return { regionName, accountId, name };
}

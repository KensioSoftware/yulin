import type { SimStateMachineType } from "../../machine/sim-state-machine.js";
import type { SimStatesTagInput } from "../../machine/sim-state-machine-tag.js";

export interface SimCreateStateMachineCommandInput {
  readonly name?: string;
  readonly definition?: string;
  readonly roleArn?: string;
  readonly type?: string;
  readonly tags?: readonly SimStatesTagInput[];
}

export interface SimCreateStateMachineCommand {
  readonly input: SimCreateStateMachineCommandInput;
}

export interface SimCreateStateMachineCommandOutput {
  readonly stateMachineArn: string;
  readonly creationDate: Date;
}

export interface SimDescribeStateMachineCommandInput {
  readonly stateMachineArn?: string;
}

export interface SimDescribeStateMachineCommand {
  readonly input: SimDescribeStateMachineCommandInput;
}

export interface SimDescribeStateMachineCommandOutput {
  readonly stateMachineArn: string;
  readonly name: string;
  readonly status: "ACTIVE";
  readonly definition: string;
  readonly roleArn: string;
  readonly type: SimStateMachineType;
  readonly creationDate: Date;
}

export interface SimUpdateStateMachineCommandInput {
  readonly stateMachineArn?: string;
  readonly definition?: string;
  readonly roleArn?: string;
}

export interface SimUpdateStateMachineCommand {
  readonly input: SimUpdateStateMachineCommandInput;
}

export interface SimUpdateStateMachineCommandOutput {
  readonly updateDate: Date;
}

export interface SimDeleteStateMachineCommandInput {
  readonly stateMachineArn?: string;
}

export interface SimDeleteStateMachineCommand {
  readonly input: SimDeleteStateMachineCommandInput;
}

export type SimDeleteStateMachineCommandOutput = Record<string, never>;

export interface SimStateMachineListItem {
  readonly stateMachineArn: string;
  readonly name: string;
  readonly type: SimStateMachineType;
  readonly creationDate: Date;
}

export interface SimListStateMachinesCommandInput {
  readonly maxResults?: number;
}

export interface SimListStateMachinesCommand {
  readonly input: SimListStateMachinesCommandInput;
}

export interface SimListStateMachinesCommandOutput {
  readonly stateMachines: readonly SimStateMachineListItem[];
}

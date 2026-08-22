import type { SimStatesExecutionStatus } from "../../execution/sim-states-execution.js";

export interface SimStartExecutionCommandInput {
  readonly stateMachineArn?: string;
  readonly name?: string;
  readonly input?: string;
}

export interface SimStartExecutionCommand {
  readonly input: SimStartExecutionCommandInput;
}

export interface SimStartExecutionCommandOutput {
  readonly executionArn: string;
  readonly startDate: Date;
}

export interface SimDescribeExecutionCommandInput {
  readonly executionArn?: string;
}

export interface SimDescribeExecutionCommand {
  readonly input: SimDescribeExecutionCommandInput;
}

export interface SimDescribeExecutionCommandOutput {
  readonly executionArn: string;
  readonly stateMachineArn: string;
  readonly name: string;
  readonly status: SimStatesExecutionStatus;
  readonly startDate: Date;
  readonly stopDate?: Date;
  readonly input: string;
  readonly output?: string;
  readonly error?: string;
  readonly cause?: string;
}

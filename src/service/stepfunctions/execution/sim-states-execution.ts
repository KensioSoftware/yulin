import type { JSONValue } from "../../../util/type-guard/json.js";

export type SimStatesExecutionStatus =
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "TIMED_OUT"
  | "ABORTED";

interface SimStatesExecutionProperties {
  readonly arn: string;
  readonly name: string;
  readonly stateMachineArn: string;
  readonly input: JSONValue;
  readonly startDate: Date;
}

/**
 * One run of a state machine.
 *
 * An execution holds what it has done as well as where it got to, because the
 * states it visited are what a test asserts on. Real Step Functions keeps the
 * same record and answers it through `GetExecutionHistory`.
 */
export class SimStatesExecution {
  readonly arn: string;
  readonly name: string;
  readonly stateMachineArn: string;
  readonly input: JSONValue;
  readonly startDate: Date;

  #status: SimStatesExecutionStatus = "RUNNING";
  #output: JSONValue | undefined;
  #error: string | undefined;
  #cause: string | undefined;
  #stopDate: Date | undefined;
  readonly #visited: string[] = [];

  constructor(properties: SimStatesExecutionProperties) {
    this.arn = properties.arn;
    this.name = properties.name;
    this.stateMachineArn = properties.stateMachineArn;
    this.input = properties.input;
    this.startDate = properties.startDate;
  }

  get status(): SimStatesExecutionStatus {
    return this.#status;
  }

  get output(): JSONValue | undefined {
    return this.#output;
  }

  get error(): string | undefined {
    return this.#error;
  }

  get cause(): string | undefined {
    return this.#cause;
  }

  get stopDate(): Date | undefined {
    return this.#stopDate;
  }

  /**
   * The states this execution has entered, in the order it entered them.
   */
  get visitedStates(): readonly string[] {
    return [...this.#visited];
  }

  /**
   * Record that the execution has entered a state.
   */
  enter(stateName: string): void {
    this.#visited.push(stateName);
  }

  /**
   * End the execution with the value its last state produced.
   */
  succeed(output: JSONValue, at: Date): void {
    this.#status = "SUCCEEDED";
    this.#output = output;
    this.#stopDate = at;
  }

  /**
   * End the execution with the error that stopped it.
   *
   * Nothing is thrown from here. An execution failing is as often the thing a
   * test is asserting on as it is a fault, and advancing the clock past a
   * failure elsewhere in the same test would otherwise raise from that
   * caller's `advanceBy`.
   */
  fail(error: string, cause: string | undefined, at: Date): void {
    this.#status = "FAILED";
    this.#error = error;
    this.#cause = cause;
    this.#stopDate = at;
  }
}

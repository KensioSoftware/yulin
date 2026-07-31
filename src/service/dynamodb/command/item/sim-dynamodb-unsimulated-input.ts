import { SimDynamoDbUnsupportedOperation } from "../../error/dynamodb.error.js";

/**
 * The request inputs one item command does not model.
 *
 * Each is refused by name rather than ignored, so a request that asks for
 * something this simulation cannot do is told so.
 */
export class SimDynamoDbUnsimulatedInput {
  private readonly operation: string;

  constructor(operation: string) {
    this.operation = operation;
  }

  /**
   * Refuse an input that asks for something.
   */
  refuse(asked: boolean, name: string, reason: string): void {
    if (!asked) {
      return;
    }

    const refusal = `${name} is not simulated, so ${this.operation} refuses it`;

    throw new SimDynamoDbUnsupportedOperation(
      `${refusal} rather than ${reason}`,
    );
  }

  /**
   * Refuse a reporting input that asks for anything.
   *
   * `NONE` is the default every one of them already behaves as, so a request
   * naming it asks for what this simulation already does.
   */
  refuseReporting(
    value: string | undefined,
    name: string,
    reason: string,
  ): void {
    this.refuse(value !== undefined && value !== "NONE", name, reason);
  }

  /**
   * Refuse an input that names anything, whatever it names it against.
   */
  refuseNamed<Value>(
    values: Readonly<Record<string, Value>> | undefined,
    name: string,
    reason: string,
  ): void {
    this.refuse(Object.keys(values ?? {}).length > 0, name, reason);
  }
}

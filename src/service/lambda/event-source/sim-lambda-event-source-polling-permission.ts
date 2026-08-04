/**
 * One thing a function's execution role has to be allowed to do for Lambda to
 * poll an event source.
 *
 * The action carries its service prefix, because that is what simulated IAM is
 * asked. The operation name is read back out of it for a refusal, which names
 * the operation the way AWS names it.
 */
export class SimLambdaEventSourcePollingPermission {
  public readonly action: string;
  public readonly resource: string;

  constructor(action: string, resource: string) {
    this.action = action;
    this.resource = resource;
  }

  /**
   * The operation this permission names, without its service prefix.
   */
  get operationName(): string {
    return this.action.slice(this.action.indexOf(":") + 1);
  }
}

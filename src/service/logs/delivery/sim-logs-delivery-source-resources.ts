/**
 * The resources a delivery source's `resourceArn` is resolved against.
 *
 * Real CloudWatch Logs resolves that ARN to a resource of the account making
 * the request, and refuses a source over one the account does not hold. A
 * simulated CloudWatch Logs on its own has no other simulated service to
 * resolve it in. A wired simulation supplies this, and a standalone SimLogs
 * leaves it out.
 */
export interface SimLogsDeliverySourceResources {
  /**
   * Why the account cannot deliver logs from the resource an ARN names, or
   * undefined where it can.
   */
  refusalFor(resourceArn: string): string | undefined;
}

/**
 * The resources of a simulation holding nothing to resolve an ARN in.
 *
 * A SimLogs built on its own takes this. A test about delivery configuration
 * alone names an ARN with no resource behind it, as it always could. A test
 * that wants the refusal builds the simulated service the ARN names too.
 */
export class SimLogsUncheckedDeliverySourceResources implements SimLogsDeliverySourceResources {
  /** Every ARN is taken, because there is nothing here to resolve one in. */
  refusalFor(): undefined {
    return;
  }
}

/**
 * The condition key naming the service a KMS request was made through.
 */
export const simKmsViaServiceConditionKey = "kms:ViaService";

/**
 * The service a KMS request reached KMS through, as `kms:ViaService` names it.
 *
 * A request a caller makes itself has no value for this key. It is set when
 * another service calls KMS on the caller's behalf, which is how a caller with
 * no KMS permission of its own can use an AWS managed key through the service
 * that owns it, and only through that service.
 *
 * The value is always the service's endpoint in the key's own region, since a
 * key can only be used in the region it belongs to.
 */
export class SimKmsViaService {
  public readonly serviceName: string;

  private readonly regionName: string;

  constructor(serviceName: string, regionName: string) {
    this.refuseEndpoint(serviceName);

    this.serviceName = serviceName;
    this.regionName = regionName;
  }

  /**
   * The `kms:ViaService` condition value, such as `ssm.eu-west-2.amazonaws.com`.
   */
  get value(): string {
    return `${this.serviceName}.${this.regionName}.amazonaws.com`;
  }

  /**
   * This value as a condition context entry.
   */
  asConditionContext(): Readonly<Record<string, string>> {
    return { [simKmsViaServiceConditionKey]: this.value };
  }

  /**
   * Refuse a whole endpoint where a service name is wanted.
   *
   * The region is the key's own, so a caller passing `ssm.us-east-1.amazonaws.com`
   * would otherwise produce a value naming a region twice, and every policy
   * condition would quietly stop matching.
   */
  private refuseEndpoint(serviceName: string): void {
    if (serviceName.includes(".")) {
      throw new Error(
        `A simulated KMS request names the service it came through by name, ` +
          `such as 'ssm', rather than by endpoint: ${serviceName}`,
      );
    }
  }
}

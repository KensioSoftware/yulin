/**
 * One header a response headers policy sets.
 *
 * The `Override` flag decides what happens when the Origin already sent a
 * header of the same name. With it set, the policy's value replaces the
 * Origin's. Without it, the Origin's value stays and the policy's is dropped.
 * A header the Origin did not send is added either way.
 *
 * https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/adding-response-headers.html
 */
export class SimCloudFrontResponseHeader {
  readonly name: string;
  readonly value: string;
  readonly override: boolean;

  constructor(properties: {
    readonly name: string;
    readonly value: string;
    readonly override?: boolean | undefined;
  }) {
    this.name = properties.name;
    this.value = properties.value;
    this.override = properties.override ?? false;
  }

  /**
   * Set this header on a response's headers, where the policy says to.
   */
  applyTo(headers: Headers): void {
    if (!this.override && headers.has(this.name)) {
      return;
    }

    headers.set(this.name, this.value);
  }
}

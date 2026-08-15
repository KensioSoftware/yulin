/**
 * How many addresses one octet holds.
 */
const octet = 256;

/**
 * The addresses the tasks of one simulated ECS scope are registered under.
 *
 * A real `awsvpc` task gets a private address on its own network interface, and
 * that address is what its service registers into a target group. There is no
 * network here to take one from, so they are counted out of the private range
 * instead, which is what simulated ELBv2 does with its ARN ids and DNS name
 * suffixes: a counted value is the real shape and a test can predict it, where
 * a random one can only be read back.
 *
 * They count within one Account and Region, because a task addresses nothing
 * outside its own scope and nothing outside it addresses a task.
 */
export class SimEcsTaskAddresses {
  #issued = 0;

  /**
   * The address the next task of this scope is registered under.
   */
  take(): string {
    this.#issued += 1;

    const third = Math.floor(this.#issued / octet) % octet;

    return `10.0.${String(third)}.${String(this.#issued % octet)}`;
  }
}

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
 * outside its own scope and nothing outside it addresses a task. An address is
 * never reused, as a real interface address is not handed back the moment a
 * task stops, and the whole of 10.0.0.0/8 is counted through before one could
 * be: a simulation would have to start sixteen million tasks in one scope to
 * reach the end of it.
 */
export class SimEcsTaskAddresses {
  #issued = 0;

  /**
   * The address the next task of this scope is registered under.
   */
  take(): string {
    this.#issued += 1;

    const second = Math.floor(this.#issued / (octet * octet)) % octet;
    const third = Math.floor(this.#issued / octet) % octet;

    return `10.${String(second)}.${String(third)}.${String(this.#issued % octet)}`;
  }
}

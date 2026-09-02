/**
 * Where a simulated Lambda's functions send what they print.
 *
 * Function output always reaches the function's log group. This settles the
 * second destination, the host console the test run itself prints to. Real
 * Lambda sends output to CloudWatch Logs and nowhere else, and Yulin forwards
 * it to the host as well so that a failing test is as easy to read as one
 * whose handler was never simulated.
 *
 * A handler that logs on every request makes that forwarding expensive. AWS
 * Lambda Powertools writes an Embedded Metric Format document for every metric
 * it counts, and a suite invoking a function a few hundred times buries its own
 * output under them. `captureOnly` turns the forwarding off for every function
 * of one simulated Lambda:
 *
 * ```typescript
 * simAws.lambda().output().captureOnly();
 * ```
 *
 * Nothing is lost by it. The log group holds every line either way, and
 * `FilterLogEvents` reads them back.
 *
 * ## What it leaves alone
 *
 * A function with no simulated CloudWatch Logs behind it keeps printing to the
 * host whatever this says. That is a function built on a standalone SimLambda,
 * outside a SimAws instance, and it has no log group for its output to be read
 * back out of. Silencing it would lose the output altogether.
 *
 * The setting is read as each line is written, so a test can turn forwarding
 * off part way through a run and the functions that have already cold started
 * follow it.
 */
export class SimLambdaOutput {
  #toHost = true;

  /**
   * Record function output to its log group alone.
   *
   * Lines written from then on stay out of the host console. Everything
   * written before it is already printed.
   */
  captureOnly(): void {
    this.#toHost = false;
  }

  /**
   * Forward function output to the host console as well as recording it, which
   * is what a simulated Lambda does until told otherwise.
   */
  teeToHost(): void {
    this.#toHost = true;
  }

  /**
   * Whether a recorded line still reaches the host console.
   *
   * Read by the two paths that write one, the vm sandbox's standard streams
   * and the process globals a host-scope handler prints through.
   * @internal
   */
  reachesHost(): boolean {
    return this.#toHost;
  }
}

/**
 * Says why a watched template could not be applied.
 *
 * A failed update leaves the Stack's previous Resources where they are, still
 * serving, which is the reason to update in place rather than restart. That is
 * only useful if the reason it failed is somewhere the person who saved the
 * file will see it.
 *
 * It goes to the console because the simulator has no logger of its own, the
 * same as every other warning it raises.
 */
export class SimCfnTemplateWatchReport {
  /**
   * Report an update the changed template file did not survive.
   */
  failed(templatePath: string, error: Error): void {
    // eslint-disable-next-line no-console
    console.warn(
      `Simulated CloudFormation could not apply the changed template ` +
        `${templatePath}: ${error.message}. The Stack is left with the ` +
        `Resources it already had.`,
    );
  }

  /**
   * Report an onUpdated callback that threw after a successful update.
   *
   * Said separately from a failed update because the Stack did change: what
   * went wrong is whatever was meant to happen next, such as reloading a page.
   */
  listenerFailed(templatePath: string, error: Error): void {
    // eslint-disable-next-line no-console
    console.warn(
      `Simulated CloudFormation updated the Stack from the changed template ` +
        `${templatePath}, and the onUpdated callback threw: ${error.message}`,
    );
  }
}

/**
 * Says why a watched template could not be applied.
 *
 * A failed update leaves the Stack where the update got to, and the process
 * serving it still up, which is the reason to update in place rather than
 * restart. That is only useful if the reason it failed is somewhere the person
 * who saved the file will see it.
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
        `${templatePath}: ${error.message}. The Stack is left where the ` +
        `update got to, since there is no rollback to the template it was ` +
        `deployed from.`,
    );
  }

  /**
   * Report something the watch was given to run afterwards that threw.
   *
   * Said separately from a failed update, because what went wrong is whatever
   * was meant to happen about the update rather than the update itself. The
   * listener names itself, since a callback and a browser to reload fail for
   * quite different reasons.
   */
  listenerFailed(templatePath: string, listener: string, error: Error): void {
    // eslint-disable-next-line no-console
    console.warn(
      `Simulated CloudFormation ran the ${listener} for the watched ` +
        `template ${templatePath}, and it threw: ${error.message}`,
    );
  }
}

/**
 * What to do about a deployed template file that changes.
 */
export interface SimCfnTemplateFileWatchOptions {
  /**
   * Run once the Stack has finished being updated from the changed file.
   *
   * This is where a served page gets reloaded, with `srv.reload()`. It runs
   * when the update is complete rather than when the write lands, so a browser
   * reloads onto the Resources the new template asked for.
   */
  readonly onUpdated?: (() => void) | undefined;

  /**
   * Handle an update the changed template did not survive.
   *
   * The Stack keeps the Resources it already had either way. Without this the
   * reason goes to the console, so a failure is not silent; with it, the reason
   * is yours to deal with and nothing is written.
   */
  readonly onFailed?: ((error: Error) => void) | undefined;

  /**
   * How long the writes have to stop for before the file counts as changed, in
   * milliseconds.
   *
   * One save is several writes, so a wait is what makes one save one update.
   * The default suits an editor saving a file and a `cdk synth` writing one.
   */
  readonly settleMs?: number | undefined;
}

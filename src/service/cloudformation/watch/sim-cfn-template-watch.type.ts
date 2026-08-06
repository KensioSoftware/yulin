/**
 * Somewhere a reload can be sent, which in practice is a local server.
 *
 * Named by the shape rather than the class, so watching a template file does
 * not drag the serving side of Yulin into a simulated CloudFormation that is
 * only being asked to update a Stack.
 */
export interface SimCfnWatchReloadTarget {
  reload(): void;

  /**
   * Give now the refusal a reload would be given later, if there is one.
   *
   * A local server refuses one outright when it was served without live
   * reload, and saying so here is what moves that refusal to the deployment
   * that asked for it. A target without it is taken as able to reload.
   */
  checkReload?(): void;
}

/**
 * What to do about a deployed template file that changes.
 */
export interface SimCfnTemplateFileWatchOptions {
  /**
   * Reload connected browsers once the Stack has finished being updated from
   * the changed file.
   *
   * This is the local server, as `{ reload: srv }`. It reloads when the update
   * is complete rather than when the write lands, so a browser reloads onto the
   * Resources the new template asked for, and an update that failed is not one
   * a browser is sent to.
   */
  readonly reload?: SimCfnWatchReloadTarget | undefined;

  /**
   * Run once the Stack has finished being updated from the changed file.
   *
   * For whatever else a change is worth doing, alongside `reload` or in place
   * of it. It runs before the reload, so a browser arriving on the new
   * Resources finds whatever this left ready for it.
   */
  readonly onUpdated?: (() => void) | undefined;

  /**
   * Handle an update the changed template did not survive.
   *
   * The Stack is left where the update got to either way, since there is no
   * rollback. Without this the reason goes to the console, so a failure is not
   * silent; with it, the reason is yours to deal with and nothing is written.
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

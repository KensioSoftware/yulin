/**
 * Thrown when a port stays held by another listener for the whole wait.
 *
 * A local development restart usually overlaps the process it replaces, so a
 * pinned port being busy for a moment is expected and is waited out. Still
 * being busy at the end of that wait means something else owns the port, which
 * no amount of further waiting will fix.
 */
export class SimAwsLocalPortInUse extends Error {
  public override readonly name = "SimAwsLocalPortInUse";

  constructor(port: number, waitedMs: number) {
    super(
      `Port ${String(port)} is held by another listener. ` +
        `It was still held after waiting ${String(waitedMs)}ms for it to be released.`,
    );
  }
}

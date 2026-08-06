/**
 * A simulated service that is holding something the process cannot exit with.
 *
 * A watch on a file or a directory keeps the event loop alive, so whatever
 * starts one has to be able to let it go again. Implementing this is what puts
 * a service in the way of `SimAws.close()`: an Account Region scope closes
 * whatever it made that closes, so a service that starts holding something
 * needs nothing added anywhere else to be let go of with the rest.
 */
export interface SimAwsClosing {
  /**
   * Let go of everything this service is holding open.
   *
   * Simulated state is not discarded: this is about the handles that keep the
   * process alive, not about resetting a simulation, and the service is as
   * usable afterwards as it was before. Closing again is not an error.
   */
  close(): void | Promise<void>;
}

/**
 * Whether a simulated service has anything to let go of when it is closed.
 */
export function isSimAwsClosing(value: object): value is SimAwsClosing {
  return "close" in value && typeof value.close === "function";
}

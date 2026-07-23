/**
 * Minimal structural SDK Command shape as received by interception.
 */
export interface SimSdkCommand {
  readonly input?: unknown;
}

/**
 * Route one intercepted SDK Command to a simulated service operation.
 */
export type SimSdkCommandRoute = (command: SimSdkCommand) => Promise<unknown>;

/**
 * Routes intercepted SDK Commands to the operations of one scoped simulated
 * AWS service instance.
 *
 * Each simulated service owns its router implementation, next to its
 * CloudFormation resource factory: the SDK interception engine routes, but
 * never knows service Command schemas.
 */
export interface SimSdkCommandRouter {
  /**
   * The SDK Command names this simulated service can handle.
   */
  supportedCommandNames(): readonly string[];

  /**
   * Get the route for an SDK Command name, if the simulated service supports
   * it.
   */
  route(commandName: string): SimSdkCommandRoute | undefined;
}

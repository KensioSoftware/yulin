import type { SimAwsPrincipal } from "../../service/aws/caller/sim-aws-caller.js";

/**
 * Minimal structural SDK Command shape as received by interception.
 */
export interface SimSdkCommand {
  readonly input?: unknown;
}

/**
 * Per-send context resolved by the interception engine for a routed Command.
 */
export interface SimSdkCommandContext {
  /**
   * The most accurate simulated caller the engine could resolve for this
   * send, such as the ambient SimAws.runAs principal, when one applies.
   * Routes pass it through to the simulated service operation so IAM
   * authorization applies to the caller rather than the Account root
   * default.
   */
  readonly caller?: SimAwsPrincipal | undefined;
}

/**
 * Route one intercepted SDK Command to a simulated service operation.
 */
export type SimSdkCommandRoute = (
  command: SimSdkCommand,
  context: SimSdkCommandContext,
) => Promise<unknown>;

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

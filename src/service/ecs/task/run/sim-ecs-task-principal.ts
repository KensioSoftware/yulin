import type { SimAwsPrincipal } from "../../../aws/caller/sim-aws-caller.js";

/**
 * The principal a task's containers make their AWS calls as.
 *
 * A task definition with no task Role runs anonymously rather than as whoever
 * asked for the task. A real task without one has no credentials of its own,
 * and taking the identity of the caller would let a container through with
 * permissions the deployed one would not have. It is the same answer for a
 * container a task runs and for one a service keeps polling, so it is given
 * once here.
 */
export function simEcsTaskPrincipal(
  taskRoleArn: string | undefined,
): SimAwsPrincipal {
  if (taskRoleArn === undefined) {
    return { kind: "anonymous" };
  }

  return { kind: "arn", arn: taskRoleArn };
}

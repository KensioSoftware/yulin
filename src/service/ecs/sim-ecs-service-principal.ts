/**
 * The service principal ECS holds a task's Roles as.
 *
 * A task role and a task execution role are both trusted by this principal,
 * and it is what `iam:PassedToService` carries when a task definition is
 * registered.
 */
export const simEcsTasksServicePrincipal = "ecs-tasks.amazonaws.com";

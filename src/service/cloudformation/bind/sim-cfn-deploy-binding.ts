import type { SimCfnEcsContainerBinding } from "../../ecs/cfn/bind/sim-cfn-ecs-container-binding.type.js";
import type { SimCfnExecutableResourceBinding } from "./sim-cfn-exec-binding.type.js";

/**
 * A real in-process handler a deployment binds to a Resource of its Stack.
 *
 * There are two kinds, because there are two kinds of thing a Stack declares
 * that Yulin can run. An executable Resource, which is a Lambda function or a
 * CloudFront Function, is one handler and is bound with `handler`. An ECS task
 * definition declares containers, so its binding names a container and carries
 * what that container does.
 *
 * They are one list because a Stack is deployed once, and a realistic Stack
 * holds both.
 */
export type SimCfnDeployBinding =
  | SimCfnExecutableResourceBinding
  | SimCfnEcsContainerBinding;

/**
 * Whether a binding backs an executable Resource with one handler.
 *
 * The handler is what tells the two kinds apart, since only an executable
 * Resource binding carries one. Everything else in a binding is a target, and
 * the two kinds share some of their target names.
 */
export function simCfnIsExecutableBinding(
  binding: SimCfnDeployBinding,
): binding is SimCfnExecutableResourceBinding {
  return "handler" in binding;
}

/**
 * Whether a binding targets a container an ECS task definition declares.
 */
export function simCfnIsContainerBinding(
  binding: SimCfnDeployBinding,
): binding is SimCfnEcsContainerBinding {
  return !simCfnIsExecutableBinding(binding);
}

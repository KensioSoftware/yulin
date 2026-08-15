import type { SimEcsContainerBindingHandler } from "../../bind/sim-ecs-container-binding.type.js";
import type { SimCfnEcsContainerBinding } from "./sim-cfn-ecs-container-binding.type.js";

/**
 * What a deploy-time binding does, without the target it named.
 *
 * A binding naming a task definition Resource has its target rewritten into the
 * family that Resource registers under, and everything else about it goes
 * through untouched. Taking the target keys off is what leaves the handler
 * behind, whichever of the shapes it is, so a handler simulated ECS refuses is
 * refused there rather than being sorted into shapes twice on the way.
 */
export function simCfnEcsBindingWork(
  binding: SimCfnEcsContainerBinding,
): SimEcsContainerBindingHandler {
  const {
    logicalId: _logicalId,
    family: _family,
    containerName: _containerName,
    imageRepository: _imageRepository,
    ...work
  } = binding;

  return work;
}

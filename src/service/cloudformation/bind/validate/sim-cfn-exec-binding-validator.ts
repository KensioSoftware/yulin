import { SimCfnEcsContainerBindingMatcher } from "../../../ecs/cfn/bind/sim-cfn-ecs-container-binding-matcher.js";
import {
  type SimCfnBinding,
  simCfnIsExecutableBinding,
} from "../sim-cfn-binding.js";
import type { SimCfnExecutableResourceBinding } from "../sim-cfn-exec-binding.type.js";
import type { SimCfnResource } from "../../resource/sim-cfn-resource.js";
import { SimCfnExecutableResourceBindingMatcher } from "./sim-cfn-exec-binding-matcher.js";

/**
 * Validate that every binding a deployment supplied targets a Resource in the
 * Stack.
 *
 * The validator owns the high-level validation contract: each supplied binding
 * must resolve to a synthesized CloudFormation Resource. The detailed matching
 * rules live with whichever kind of binding it is, in
 * `SimCfnExecutableResourceBindingMatcher` for a handler backing an executable
 * Resource and in `SimCfnEcsContainerBindingMatcher` for a container an ECS
 * task definition declares, which keeps this file small and focused on
 * reporting actionable validation errors.
 */
export function validateSimCfnExecutableResourceBindings(properties: {
  readonly stackName: string;
  readonly resources: ReadonlyMap<string, SimCfnResource>;
  readonly bindings?: readonly SimCfnBinding[] | undefined;
}): void {
  const bindings = properties.bindings ?? [];
  const matcher = new SimCfnExecutableResourceBindingMatcher(
    properties.resources,
  );
  const containerMatcher = new SimCfnEcsContainerBindingMatcher(
    properties.resources,
  );

  for (const binding of bindings) {
    if (!simCfnIsExecutableBinding(binding)) {
      if (containerMatcher.matches(binding)) {
        continue;
      }

      throw unresolvedBindingError(
        properties.stackName,
        SimCfnEcsContainerBindingMatcher.describe(binding),
      );
    }

    if (matcher.matches(binding)) {
      continue;
    }

    throw unresolvedBindingError(
      properties.stackName,
      describeBinding(binding),
    );
  }
}

function unresolvedBindingError(stackName: string, described: string): Error {
  return new Error(
    `Invalid sim CloudFormation executable binding in Stack ${stackName}: ${described} does not resolve to a Resource in the Stack`,
  );
}

function describeBinding(binding: SimCfnExecutableResourceBinding): string {
  if ("logicalId" in binding) {
    return `logicalId ${JSON.stringify(binding.logicalId)}`;
  }

  if ("functionName" in binding) {
    return `functionName ${JSON.stringify(binding.functionName)}`;
  }

  if ("arn" in binding) {
    return `arn ${JSON.stringify(binding.arn)}`;
  }

  if ("cdkPath" in binding) {
    return `cdkPath ${JSON.stringify(binding.cdkPath)}`;
  }

  if ("imageRepository" in binding) {
    return `imageRepository ${JSON.stringify(binding.imageRepository)}`;
  }

  /* v8 ignore next -- compile-time exhaustive guard */
  return "unknown binding target";
}

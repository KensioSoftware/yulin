import {
  properties,
  renamed,
  tags,
  type TerraformMappingContext,
} from "../sim-tf-attributes.js";
import { lambdaEnvironment } from "./sim-tf-map-lambda-environment.js";
import type { TerraformMappedResource } from "../sim-tf-mapping.type.js";

/**
 * A function, minus its code.
 *
 * Terraform points at a zip on disk, an S3 object or a container image, and
 * none of the three is a handler Yulin can run. A simulated function takes its
 * behaviour from a deploy binding instead, matched on the function name the
 * template carries.
 */
export function lambdaFunction(
  context: TerraformMappingContext,
): TerraformMappedResource {
  const environment = lambdaEnvironment(context);

  return {
    Type: "AWS::Lambda::Function",
    Properties: {
      ...renamed(context, {
        FunctionName: "function_name",
        Handler: "handler",
        Runtime: "runtime",
        Role: "role",
        Timeout: "timeout",
        MemorySize: "memory_size",
      }),
      ...properties({
        Environment: environment.property,
        Tags: tags(context),
      }),
    },
    /*
     * The code is always lost, since a plan points at a zip, an S3 object or
     * an image. The environment joins it only where the plan collapsed the
     * variables map and no override supplied one.
     */
    lost: ["code", ...environment.lost],
    /*
     * A function whose execution role the plan does not create, such as one
     * read out of a data source, has no role for the template to name. Sim
     * Lambda refuses a function without one, so the function is left out and
     * recorded rather than failing the Stack around it.
     */
    requires: ["Role"],
  };
}

/** One permission to invoke a function. */
export function lambdaPermission(
  context: TerraformMappingContext,
): TerraformMappedResource {
  return {
    Type: "AWS::Lambda::Permission",
    Properties: renamed(context, {
      FunctionName: "function_name",
      Action: "action",
      Principal: "principal",
      SourceArn: "source_arn",
    }),
    requires: ["FunctionName", "Action", "Principal"],
  };
}

/**
 * An event source mapping. Simulated Lambda checks the execution role is
 * allowed to poll the source, so a role whose policy the plan lost fails here.
 */
export function lambdaEventSourceMapping(
  context: TerraformMappingContext,
): TerraformMappedResource {
  return {
    Type: "AWS::Lambda::EventSourceMapping",
    Properties: renamed(context, {
      EventSourceArn: "event_source_arn",
      FunctionName: "function_name",
      BatchSize: "batch_size",
      Enabled: "enabled",
    }),
    requires: ["EventSourceArn", "FunctionName"],
  };
}

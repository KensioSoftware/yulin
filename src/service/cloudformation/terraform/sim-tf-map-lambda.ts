/*
 * Reading a plan means reading records whose keys come from the document
 * rather than from this code, so the object-injection rule fires on every
 * lookup. The records are parsed JSON with no prototype of their own.
 */
// oxlint-disable security/detect-object-injection
import { isRecord } from "../../../util/type-guard/record.js";
import type { SimCfnTemplateValue } from "../template/value/sim-cfn-template-value.js";
import {
  block,
  field,
  properties,
  renamed,
  tags,
  templateValue,
  type TerraformMappingContext,
} from "./sim-tf-attributes.js";
import type { TerraformMappedResource } from "./sim-tf-mapping.type.js";

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
  const variables = environmentVariables(context);

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
        Environment: variables && { Variables: variables },
        Tags: tags(context),
      }),
    },
    lost: lost(context, variables),
  };
}

function environmentVariables(
  context: TerraformMappingContext,
): Record<string, never> | undefined {
  const environment = block(context, "environment");
  const variables = environment && field(environment, "variables");

  if (!isRecord(variables)) {
    return undefined;
  }

  const value: SimCfnTemplateValue | undefined = templateValue(variables);

  return value as Record<string, never> | undefined;
}

/**
 * What the mapping could not carry.
 *
 * The code is always one. The environment variables are another whenever any
 * value in the map names a resource of the same plan, because Terraform marks
 * the whole map unknown and the variable names go with it.
 */
function lost(
  context: TerraformMappingContext,
  variables: Record<string, never> | undefined,
): readonly string[] {
  const declared = field(context.resource.unknown, "environment");
  const entries: readonly unknown[] = Array.isArray(declared) ? declared : [];
  const first = entries[0];
  const collapsed =
    isRecord(first) &&
    field(first, "variables") === true &&
    variables === undefined;

  return collapsed ? ["code", "environment.variables"] : ["code"];
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
  };
}

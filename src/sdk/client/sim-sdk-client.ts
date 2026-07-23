import {
  AWS_REGION_NAMES,
  type AwsRegionName,
} from "../../service/aws/sim-aws-region.js";
import { isRecord } from "../../util/type-guard/record.js";
import { SimSdkInvalidClientError } from "../error/sim-sdk.error.js";

/**
 * Get the resolved config of an SDK client, if it has one.
 */
function clientConfig(client: unknown): Record<string, unknown> | undefined {
  if (!isRecord(client)) {
    return undefined;
  }
  const config = client["config"];
  return isRecord(config) ? config : undefined;
}

/**
 * Identify the AWS service an intercepted SDK client belongs to.
 *
 * Real SDK clients carry the service identity in their resolved config, e.g.
 * "S3" or "DynamoDB", which is more reliable than parsing class names.
 */
export function simSdkClientServiceId(client: unknown): string {
  const serviceId = clientConfig(client)?.["serviceId"];
  if (typeof serviceId !== "string" || serviceId.length === 0) {
    throw new SimSdkInvalidClientError(
      "Intercepted SDK client has no config.serviceId to identify its AWS " +
        "service",
    );
  }
  return serviceId;
}

/**
 * Resolve the AWS Region an intercepted SDK client is configured for.
 *
 * Real SDK clients normalize the region to an async provider function. The
 * fallback Region is used when the client has no region configured or its
 * provider fails, so interception never depends on real environment or
 * network region resolution.
 */
export async function simSdkClientRegionName(
  client: unknown,
  fallback: AwsRegionName,
): Promise<AwsRegionName> {
  const region = clientConfig(client)?.["region"];
  if (typeof region === "string") {
    return toAwsRegionName(region);
  }
  if (typeof region !== "function") {
    return fallback;
  }

  let resolved: unknown;
  try {
    resolved = await (region as () => unknown)();
  } catch {
    return fallback;
  }
  return typeof resolved === "string" ? toAwsRegionName(resolved) : fallback;
}

/**
 * Validate that a client-configured region string is a known AWS Region.
 */
function toAwsRegionName(value: string): AwsRegionName {
  if (!(AWS_REGION_NAMES as readonly string[]).includes(value)) {
    throw new SimSdkInvalidClientError(
      `Intercepted SDK client Region ${value} is not a known AWS Region`,
    );
  }
  return value as AwsRegionName;
}

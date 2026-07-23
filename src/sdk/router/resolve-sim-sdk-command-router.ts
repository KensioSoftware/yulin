import type { SimAwsAccountId } from "../../service/aws/sim-aws-account.js";
import type { AwsRegionName } from "../../service/aws/sim-aws-region.js";
import type { SimAws } from "../../service/aws/sim-aws.js";
import { SimSdkUnknownServiceError } from "../error/sim-sdk.error.js";
import type { SimSdkCommandRouter } from "./sim-sdk-command-router.type.js";

/**
 * Resolve the scoped simulated service SDK Command router for an intercepted
 * client's AWS service.
 *
 * Mirrors the CloudFormation service resolver: the interception engine
 * resolves the Account/Region scope and the service identity, then the scoped
 * simulated service owns its own Command routing. Simulated services come
 * into existence lazily here, on the first intercepted Command that reaches
 * them.
 */
export function resolveSimSdkCommandRouter(
  simAws: SimAws,
  serviceId: string,
  accountId: SimAwsAccountId | string,
  regionName: AwsRegionName,
): SimSdkCommandRouter {
  const scoped = simAws.account(accountId).region(regionName);

  switch (serviceId) {
    case "S3": {
      return scoped.s3().sdkCommandRouter();
    }
    default: {
      throw new SimSdkUnknownServiceError(
        `Simulated AWS has no SDK interception support for service ` +
          `${serviceId} yet`,
      );
    }
  }
}

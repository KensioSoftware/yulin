import type { SimAwsServiceTarget } from "../../../serve/controller/sim-service-controller.js";
import { executeApiHostLabel } from "../../apigatewayv2/api/sim-http-api-host.js";
import type { AwsRegionName } from "../../aws/sim-aws-region.js";
import { lambdaFunctionUrlHostLabel } from "../../lambda/function/url/sim-lambda-function-url-host.js";

const cognitoIdpServiceLabel = "cognito-idp";

/**
 * Maps the Yulin-local hostnames whose last label is a Region to simulated
 * service targets.
 *
 * These are the endpoints the AWS SDK talks to, and the local URL rewriting
 * drops the AWS domain from each of them, which is what leaves the Region as
 * the last label. Grouping them here keeps that one rule in one place, and
 * leaves the resolver with the hostnames that keep their own domain.
 */
export class SimRoute53RegionalServiceTargets {
  /**
   * Convert a logical hostname ending in a Region into a service target.
   */
  resolve(logicalName: string): SimAwsServiceTarget | undefined {
    const labels = logicalName.split(".");

    return this.cognitoIdpTarget(labels) ?? this.resourceEndpointTarget(labels);
  }

  /**
   * Resolve Cognito user pool endpoint hostnames.
   *
   * Simulated Cognito hostnames use:
   *
   *   cognito-idp.<region>
   *
   * The hostname names the regional Cognito endpoint rather than one pool, as
   * the real `cognito-idp.<region>.amazonaws.com` does, and the pool id is the
   * first path segment. The resource name is therefore empty, in the same way
   * it is for the path-style S3 endpoint.
   */
  private cognitoIdpTarget(
    labels: readonly string[],
  ): SimAwsServiceTarget | undefined {
    if (labels.length !== 2) {
      return undefined;
    }

    const [service, regionName] = labels;

    if (service !== cognitoIdpServiceLabel || regionName === undefined) {
      return undefined;
    }

    return {
      service: "cognitoIdentityProvider",
      resourceName: "",
      regionName: regionName as AwsRegionName,
    };
  }

  /**
   * Resolve the endpoints one resource is issued, which name that resource in
   * their first label:
   *
   *   <url-id>.lambda-url.<region>    a Lambda Function URL
   *   <api-id>.execute-api.<region>   an API Gateway HTTP API
   *
   * The real AWS endpoints end `.on.aws` and `.amazonaws.com`, which the local
   * URL rewriting drops in the same way it drops `.amazonaws.com` from S3
   * endpoints. Both ids are one DNS label, so the label count here is exact.
   */
  private resourceEndpointTarget(
    labels: readonly string[],
  ): SimAwsServiceTarget | undefined {
    if (labels.length !== 3) {
      return undefined;
    }

    const [resourceName, service, regionName] = labels;

    /* v8 ignore if -- empty labels are rejected before resolution */
    if (resourceName === undefined || regionName === undefined) {
      return undefined;
    }

    const endpointService = this.endpointService(service);

    if (endpointService === undefined) {
      return undefined;
    }

    return {
      service: endpointService,
      resourceName,
      regionName: regionName as AwsRegionName,
    };
  }

  /**
   * Which service issues an endpoint hostname carrying a service label.
   */
  private endpointService(
    service: string | undefined,
  ): SimAwsServiceTarget["service"] | undefined {
    if (service === lambdaFunctionUrlHostLabel) {
      return "lambda";
    }

    if (service === executeApiHostLabel) {
      return "apiGatewayV2";
    }

    return undefined;
  }
}

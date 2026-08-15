import type { SimAwsServiceTarget } from "./sim-service-controller.js";

/**
 * The SigV4 signing name of each simulated service a request can be routed to.
 *
 * Service targets use the simulator's own naming, which follows the SDK client
 * names, while a credential scope names the service the way the signer does.
 * They agree for most services and not for CloudFront, so the two vocabularies
 * are mapped here rather than assumed to be the same string.
 */
export function simAwsServiceSigningName(
  service: SimAwsServiceTarget["service"],
): string {
  switch (service) {
    case "cloudFront": {
      return "cloudfront";
    }
    case "s3": {
      return "s3";
    }
    case "lambda": {
      return "lambda";
    }
    case "route53": {
      return "route53";
    }
    case "cognitoIdentityProvider": {
      return "cognito-idp";
    }
    case "apiGatewayV2": {
      // The generated API endpoint signs as execute-api, not as the
      // apigateway control plane that created the API.
      return "execute-api";
    }
    case "elbV2": {
      // Nothing signs a request to a load balancer: what it serves is an
      // ordinary application rather than an AWS API. The name is here so the
      // mapping stays complete.
      return "elasticloadbalancing";
    }
  }
}

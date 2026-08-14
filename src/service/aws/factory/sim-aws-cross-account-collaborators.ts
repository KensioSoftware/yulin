import { SimRoute53AcmDnsRecords } from "../../acm/validation/sim-route53-acm-dns-records.js";
import { SimCognitoHttpApiJwtIssuerKeys } from "../../apigatewayv2/api/authorizer/sim-cognito-http-api-jwt-issuer-keys.js";
import type { SimAwsScopedServiceRegistries } from "./sim-aws-scoped-service-registries.js";

/**
 * The DNS a simulated ACM certificate validates against.
 *
 * Certificates validate against Hosted Zones from any simulated Account, as
 * real ACM validates against public DNS, so this reads the whole simulation's
 * Route 53 rather than one scope's.
 */
export function simAwsAcmDnsRecords(
  registries: SimAwsScopedServiceRegistries,
): SimRoute53AcmDnsRecords {
  return new SimRoute53AcmDnsRecords({ route53Registry: registries.route53 });
}

/**
 * The keys a simulated HTTP API's JWT authorizer verifies against.
 *
 * A JWT authorizer can name a user pool in any Account, as a real one can, so
 * this reads the whole simulation's Cognito rather than one scope's.
 */
export function simAwsHttpApiJwtIssuerKeys(
  registries: SimAwsScopedServiceRegistries,
): SimCognitoHttpApiJwtIssuerKeys {
  return new SimCognitoHttpApiJwtIssuerKeys({
    userPoolRegistry: registries.cognito,
  });
}

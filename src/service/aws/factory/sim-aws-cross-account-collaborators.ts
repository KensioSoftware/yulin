import { SimRoute53AcmDnsRecords } from "../../acm/validation/sim-route53-acm-dns-records.js";
import { SimCognitoHttpApiJwtIssuerKeys } from "../../apigatewayv2/api/authorizer/sim-cognito-http-api-jwt-issuer-keys.js";
import { SimAwsEventBridgeDeliveryTargets } from "../../eventbridge/delivery/sim-aws-event-bridge-delivery-targets.js";
import { SimAwsRekognitionImageObjects } from "../../rekognition/image/s3/sim-aws-rekognition-image-objects.js";
import { SimAwsSchedulerDeliveryTargets } from "../../scheduler/delivery/sim-aws-scheduler-delivery-targets.js";
import type { SimAwsAccountRegionContainer } from "../sim-aws-account-region-scope.js";
import type { SimAws } from "../sim-aws.js";
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

/**
 * Everywhere a simulated EventBridge rule can deliver.
 *
 * Rules deliver to targets in any Account and Region of the simulation, as real
 * EventBridge delivers across both.
 */
export function simAwsEventBridgeDeliveryTargets(
  simAws: SimAws,
): SimAwsEventBridgeDeliveryTargets {
  return new SimAwsEventBridgeDeliveryTargets({ simAws });
}

/**
 * Everywhere a simulated Scheduler schedule can invoke.
 *
 * A schedule assumes its execution role in that role's own Account and reaches
 * its target in the target's, which need not be the same one, so this reads the
 * whole simulation rather than one scope.
 */
export function simAwsSchedulerDeliveryTargets(
  simAws: SimAws,
): SimAwsSchedulerDeliveryTargets {
  return new SimAwsSchedulerDeliveryTargets({ simAws });
}

/**
 * The images a simulated Rekognition detection reads.
 *
 * Real Rekognition reads a Bucket another Account's policy admits it to, so
 * this reads the whole simulation's S3 rather than one scope's.
 */
export function simAwsRekognitionImages(
  simAws: SimAws,
  scope: SimAwsAccountRegionContainer,
): SimAwsRekognitionImageObjects {
  return new SimAwsRekognitionImageObjects({
    simAws,
    accountRegionScope: scope.accountRegionScope,
  });
}

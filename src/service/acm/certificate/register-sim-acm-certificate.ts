import { parseSimArn, type SimArn } from "../../aws/arn.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { SimAcmInvalidArgumentsException } from "../error/sim-acm.error.js";
import {
  SimAcmCertificate,
  type SimAcmCertificateStatus,
} from "./sim-acm-certificate.js";
import { type SimClock, SimRealClock } from "../../../util/clock/sim-clock.js";

/**
 * What a simulation says about a Certificate it registers as already existing.
 */
export interface SimAcmCertificateRegistration {
  /**
   * The Certificate ARN the simulated Certificate takes. It has to be in this
   * ACM's own Account and Region, since that is how other services find it.
   */
  readonly arn: string;
  readonly domainName: string;
  readonly subjectAlternativeNames?: readonly string[] | undefined;
  /**
   * The status the Certificate holds. `ISSUED` by default, a registered
   * Certificate having been described as already existing.
   */
  readonly status?: SimAcmCertificateStatus | undefined;
}

interface RegisterSimAcmCertificateProperties {
  readonly certificates: Map<SimArn, SimAcmCertificate>;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly clock?: SimClock | undefined;
}

/**
 * Register a Certificate the simulation is told already exists.
 *
 * Real ACM allocates a Certificate ARN, so nothing on the command surface
 * takes one. A CDK app that passes a certificate ARN between stacks bakes that
 * ARN into the template of the stack using it, and this is how a simulation
 * comes to own that ARN before the template deploys.
 *
 * The Certificate is ISSUED from the start. There is nothing to validate: it
 * is described as already existing rather than requested here, so it carries
 * no domain validation options.
 */
export function registerSimAcmCertificate(
  registration: SimAcmCertificateRegistration,
  properties: RegisterSimAcmCertificateProperties,
): SimAcmCertificate {
  const { certificates, accountRegionScope } = properties;
  const certificateArn = scopedCertificateArn(
    registration.arn,
    accountRegionScope,
  );

  if (certificates.has(certificateArn)) {
    throw new SimAcmInvalidArgumentsException(
      `A sim ACM Certificate with ARN ${certificateArn} already exists`,
    );
  }

  const clock = properties.clock ?? new SimRealClock();
  const registeredAt = clock.now();
  const status = registration.status ?? "ISSUED";

  const certificate = new SimAcmCertificate({
    certificateArn,
    domainName: registration.domainName,
    subjectAlternativeNames: registration.subjectAlternativeNames ?? [],
    status,
    clock,
    createdAt: registeredAt,
    issuedAt: status === "ISSUED" ? registeredAt : undefined,
  });

  certificates.set(certificateArn, certificate);

  return certificate;
}

/**
 * Read a Certificate ARN this ACM can be found by.
 *
 * Other services reach a Certificate through the Account and Region in its
 * ARN, so an ARN naming another scope would answer ACM commands here and be
 * missed by every service that looks it up. Refusing it keeps the two views of
 * the Certificate together.
 */
function scopedCertificateArn(
  value: string,
  accountRegionScope: SimAwsAccountRegionScope,
): SimArn {
  const arn = parseSimArn(value);

  if (arn?.service !== "acm" || arn.resourceType !== "certificate") {
    throw new SimAcmInvalidArgumentsException(
      `${value} is not a sim ACM Certificate ARN`,
    );
  }

  const { accountId, regionName } = accountRegionScope;

  if (arn.accountId !== accountId || arn.region !== regionName) {
    throw new SimAcmInvalidArgumentsException(
      `Sim ACM Certificate ARN ${value} names Account ${arn.accountId} in ${arn.region}, ` +
        `but this sim ACM is Account ${accountId} in ${regionName}`,
    );
  }

  return value as SimArn;
}

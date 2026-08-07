import type { SimRoute53HostedZoneConfig } from "../command/create-hosted-zone/create-hosted-zone.command.js";
import {
  normalizeSimRoute53HostedZoneId,
  type SimRoute53HostedZoneId,
} from "../command/create-hosted-zone/sim-route53-zone-id.js";
import { SimRoute53HostedZoneAlreadyExists } from "../error/sim-route53.error.js";
import type { SimRoute53Registry } from "../registry/sim-route53-registry.js";
import { SimRoute53HostedZone } from "./sim-route53-hosted-zone.js";

/**
 * What a simulation says about a Hosted Zone it registers as already existing.
 */
export interface SimRoute53HostedZoneRegistration {
  /**
   * The Hosted Zone ID the simulated zone takes, in either the bare `Z...`
   * form or the `/hostedzone/Z...` form.
   */
  readonly id: SimRoute53HostedZoneId | string;
  readonly name: string;
  readonly config?: SimRoute53HostedZoneConfig | undefined;
  /**
   * Whether the name is a guess that the records the zone comes to hold may
   * widen. This is for the zone a CloudFormation template names by ID without
   * saying what it is called, and ordinary registrations leave it alone.
   */
  readonly nameInferred?: boolean | undefined;
}

interface RegisterSimRoute53HostedZoneProperties {
  readonly hostedZones: Map<SimRoute53HostedZoneId, SimRoute53HostedZone>;
  readonly route53Registry: SimRoute53Registry;
}

/**
 * Register a Hosted Zone the simulation is told already exists.
 *
 * Real Route53 allocates a Hosted Zone ID, so nothing on the command surface
 * takes one. A zone a CDK app looked up rather than created is named by its
 * real ID throughout the synthesized template, and this is how a simulation
 * comes to own that ID before the template deploys.
 *
 * The zone is INSYNC from the start. There is nothing to synchronize: it is
 * described as already existing rather than created here.
 */
export function registerSimRoute53HostedZone(
  registration: SimRoute53HostedZoneRegistration,
  properties: RegisterSimRoute53HostedZoneProperties,
): SimRoute53HostedZone {
  const { hostedZones, route53Registry } = properties;
  const hostedZoneId = normalizeSimRoute53HostedZoneId(registration.id);

  if (
    hostedZones.has(hostedZoneId) ||
    route53Registry.hostedZones.has(hostedZoneId)
  ) {
    throw new SimRoute53HostedZoneAlreadyExists(
      `A sim Route53 Hosted Zone with ID ${hostedZoneId} already exists`,
    );
  }

  const hostedZone = new SimRoute53HostedZone({
    id: hostedZoneId,
    name: registration.name,
    // A registered zone has no caller reference of its own, its creation
    // having happened elsewhere, so its ID stands in as the unique one.
    callerReference: `registered-${hostedZoneId}`,
    config: registration.config,
    nameInferred: registration.nameInferred,
  });
  hostedZone.markSynchronized();

  hostedZones.set(hostedZoneId, hostedZone);
  route53Registry.registerHostedZone(hostedZoneId, hostedZone);

  return hostedZone;
}

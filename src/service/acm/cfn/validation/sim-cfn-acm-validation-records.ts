import type { SimRoute53 } from "../../../route53/sim-route53.js";
import type { SimRoute53HostedZone } from "../../../route53/hosted-zone/sim-route53-hosted-zone.js";
import type { SimRoute53HostedZoneId } from "../../../route53/command/create-hosted-zone/sim-route53-zone-id.js";
import type { SimAcmCertificate } from "../../certificate/sim-acm-certificate.js";
import type { SimAcmDomainValidation } from "../../certificate/sim-acm-domain-validation.js";
import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";

const validationRecordTtl = 300;

interface SimCfnAcmValidationRecordsProperties {
  readonly route53: SimRoute53;
}

/**
 * Publishes the ACM validation records a CloudFormation template asks for.
 *
 * Records go through the normal Route53 command path rather than being written
 * into the hosted zone directly, so each one is an ordinary record in the
 * zone: listed by ListResourceRecordSets and answerable over DNS.
 */
export class SimCfnAcmValidationRecords {
  private readonly route53: SimRoute53;

  constructor(properties: SimCfnAcmValidationRecordsProperties) {
    this.route53 = properties.route53;
  }

  /**
   * Publish the validation record for every domain naming a Hosted Zone.
   */
  async publish(
    certificate: SimAcmCertificate,
    hostedZoneIdsByDomain: ReadonlyMap<string, string>,
    options?: SimCfnResourceCallerOptions,
  ): Promise<void> {
    for (const domainValidation of certificate.domainValidationOptions) {
      // oxlint-disable-next-line no-await-in-loop -- one hosted zone at a time
      await this.publishRecord(
        domainValidation,
        hostedZoneIdsByDomain,
        options,
      );
    }
  }

  /**
   * Publish one domain's validation record into the Hosted Zone named for it.
   *
   * A HostedZoneId naming a zone this simulator does not hold is skipped
   * rather than failing. Hosted zones are commonly managed outside the stack
   * under test, and the certificate then follows the usual rule: with nothing
   * authoritative for its domain, it is issued without validation.
   */
  private async publishRecord(
    domainValidation: SimAcmDomainValidation,
    hostedZoneIdsByDomain: ReadonlyMap<string, string>,
    options: SimCfnResourceCallerOptions,
  ): Promise<void> {
    const resourceRecord = domainValidation.resourceRecord;
    const hostedZoneIdValue = hostedZoneIdsByDomain.get(
      domainValidation.domainName,
    );

    if (resourceRecord === undefined || hostedZoneIdValue === undefined) {
      return;
    }

    const hostedZone = this.findHostedZone(hostedZoneIdValue);

    if (hostedZone === undefined) {
      return;
    }

    await this.route53.changeResourceRecordSets(
      {
        input: {
          HostedZoneId: hostedZone.id,
          ChangeBatch: {
            Changes: [
              {
                Action: "UPSERT",
                ResourceRecordSet: {
                  Name: resourceRecord.name,
                  Type: resourceRecord.type,
                  TTL: validationRecordTtl,
                  ResourceRecords: [{ Value: resourceRecord.value }],
                },
              },
            ],
          },
        },
      },
      options,
    );

    // The record mutation is scheduled, so wait for the zone to hold it before
    // the certificate is checked against DNS.
    await hostedZone.waitForSynchronizationComplete();
  }

  /**
   * Find the Hosted Zone a template's HostedZoneId names, if it is here.
   *
   * The ID is matched leniently, accepting the `/hostedzone/` prefixed form
   * AWS also uses. It is deliberately not validated as a simulator-shaped zone
   * ID: a template commonly carries the ID of a real zone from a real account,
   * and that is an external zone rather than a broken template.
   */
  private findHostedZone(
    hostedZoneIdValue: string,
  ): SimRoute53HostedZone | undefined {
    const hostedZoneId = hostedZoneIdValue.replace(/^\/?hostedzone\//u, "");

    return this.route53.hostedZones.get(hostedZoneId as SimRoute53HostedZoneId);
  }
}

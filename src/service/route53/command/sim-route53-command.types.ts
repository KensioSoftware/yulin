/**
 * The command types of every simulated Route53 operation, in one place.
 *
 * The SimRoute53 facade handles all of them, so gathering the types here keeps
 * it a delegation rather than a page of imports.
 */
export type {
  SimCreateHostedZoneCommand,
  SimCreateHostedZoneCommandOutput,
} from "./create-hosted-zone/create-hosted-zone.command.js";

export type {
  SimGetHostedZoneCommand,
  SimGetHostedZoneCommandOutput,
} from "./get-hosted-zone/get-hosted-zone.command.js";

export type {
  SimDeleteHostedZoneCommand,
  SimDeleteHostedZoneCommandOutput,
} from "./delete-hosted-zone/delete-hosted-zone.command.js";

export type {
  SimListHostedZonesByNameCommand,
  SimListHostedZonesByNameCommandOutput,
} from "./list-hosted-zones-by-name/list-hosted-zones-by-name.command.js";

export type {
  SimListResourceRecordSetsCommand,
  SimListResourceRecordSetsCommandOutput,
} from "./list-resource-record-sets/list-resource-record-sets.command.js";

export type {
  SimChangeResourceRecordSetsCommand,
  SimChangeResourceRecordSetsCommandOutput,
} from "./change-resource-record-sets/change-resource-record-sets.command.js";

export type {
  SimCreateKeySigningKeyCommand,
  SimCreateKeySigningKeyCommandOutput,
  SimGetDnssecCommand,
  SimGetDnssecCommandOutput,
  SimHostedZoneDnssecCommand,
  SimHostedZoneDnssecCommandOutput,
  SimKeySigningKeyCommand,
  SimKeySigningKeyCommandOutput,
} from "./dnssec/dnssec.command.js";

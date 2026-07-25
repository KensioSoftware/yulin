import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimRoute53HostedZone } from "../../hosted-zone/sim-route53-hosted-zone.js";
import type { SimRoute53Record } from "../../record/sim-route53-record.js";
import type {
  SimRoute53Change,
  SimRoute53ResourceRecordSet,
} from "./change-resource-record-sets.command.js";
import { isSimRoute53RecordType } from "../../record/sim-route53-record-type.js";

/**
 * Validate a Route53 resource record set change without mutating the Hosted Zone.
 */
export function validateChangeResourceRecordSet(
  change: SimRoute53Change,
): void {
  const action = change.Action;
  assertDefined(action, "ChangeResourceRecordSetsCommand.Change.Action");

  const resourceRecordSet = change.ResourceRecordSet;
  assertDefined(
    resourceRecordSet,
    "ChangeResourceRecordSetsCommand.Change.ResourceRecordSet",
  );

  switch (action) {
    case "CREATE":
    case "UPSERT":
    case "DELETE": {
      break;
    }

    default: {
      /* v8 ignore next */
      throw new Error(
        `Unsupported ChangeResourceRecordSetsCommand.Change.Action ${String(action)}`,
      );
    }
  }

  toSimRoute53Record(resourceRecordSet);
}

/**
 * Applies a Route53 resource record set change to a simulated hosted zone.
 */
export function applyChangeResourceRecordSet(
  hostedZone: SimRoute53HostedZone,
  change: SimRoute53Change,
): void {
  const action = change.Action;
  assertDefined(action, "ChangeResourceRecordSetsCommand.Change.Action");

  const resourceRecordSet = change.ResourceRecordSet;
  assertDefined(
    resourceRecordSet,
    "ChangeResourceRecordSetsCommand.Change.ResourceRecordSet",
  );

  const record = toSimRoute53Record(resourceRecordSet);

  switch (action) {
    case "CREATE": {
      hostedZone.records.create(record);
      return;
    }

    case "UPSERT": {
      hostedZone.records.upsert(record);
      return;
    }

    case "DELETE": {
      hostedZone.records.delete(record.name, record.type);
      return;
    }
  }
}

function toSimRoute53Record(
  resourceRecordSet: SimRoute53ResourceRecordSet,
): SimRoute53Record {
  const name = resourceRecordSet.Name;
  assertDefined(name, "ChangeResourceRecordSetsCommand.ResourceRecordSet.Name");

  const type = resourceRecordSet.Type;
  assertDefined(type, "ChangeResourceRecordSetsCommand.ResourceRecordSet.Type");

  if (!isSimRoute53RecordType(type)) {
    throw new Error(
      `Unsupported ChangeResourceRecordSetsCommand.ResourceRecordSet.Type ${type}`,
    );
  }

  const isAlias = resourceRecordSet.AliasTarget !== undefined;
  const values =
    resourceRecordSet.AliasTarget === undefined
      ? resourceRecordSet.ResourceRecords?.map((record) => {
          assertDefined(
            record.Value,
            "ChangeResourceRecordSetsCommand.ResourceRecordSet.ResourceRecords.Value",
          );
          return record.Value;
        })
      : ((): string[] => {
          const dnsName = resourceRecordSet.AliasTarget.DNSName;
          assertDefined(
            dnsName,
            "ChangeResourceRecordSetsCommand.ResourceRecordSet.AliasTarget.DNSName",
          );
          return [dnsName];
        })();

  assertDefined(
    values,
    "ChangeResourceRecordSetsCommand.ResourceRecordSet.ResourceRecords",
  );

  return {
    name,
    type,
    values,
    ttl: resourceRecordSet.TTL,
    alias: isAlias,
  };
}

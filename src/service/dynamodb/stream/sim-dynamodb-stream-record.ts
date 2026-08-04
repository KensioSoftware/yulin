import { randomUUID } from "node:crypto";
import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimDynamoDbStreamViewType } from "./sim-dynamodb-stream.types.js";
import type { SimDynamoDbItem } from "../item/sim-dynamodb-item.js";
import type { SimDynamoDbKeySchema } from "../table/sim-dynamodb-key-schema.js";
import type { SimDynamoDbItemChange } from "./sim-dynamodb-item-change.js";
import { simDynamoDbStreamImages } from "./sim-dynamodb-stream-images.js";
import { simDynamoDbStreamRecordKeys } from "./sim-dynamodb-stream-record-keys.js";
import { simDynamoDbStreamRecordSize } from "./sim-dynamodb-stream-record-size.js";

/**
 * What kind of change one stream record reports.
 */
export type SimDynamoDbStreamEventName = "INSERT" | "MODIFY" | "REMOVE";

/**
 * Who made the change a record reports, when it was not the application.
 *
 * Only a time to live deletion carries one. It is how an application tells a
 * deletion it never asked for from one of its own, which matters because the
 * two want completely different handling downstream.
 */
export interface SimDynamoDbStreamUserIdentity {
  readonly type: "Service";
  readonly principalId: "dynamodb.amazonaws.com";
}

/**
 * The identity a time to live deletion is written under.
 */
const timeToLiveIdentity: SimDynamoDbStreamUserIdentity = {
  type: "Service",
  principalId: "dynamodb.amazonaws.com",
};

interface SimDynamoDbStreamRecordProperties {
  readonly change: SimDynamoDbItemChange;
  readonly keySchema: SimDynamoDbKeySchema;
  readonly viewType: SimDynamoDbStreamViewType;
  readonly sequenceNumber: string;
  readonly at: Date;
}

/**
 * Which of the three kinds of change these images are.
 */
function eventNameOf(
  change: SimDynamoDbItemChange,
): SimDynamoDbStreamEventName {
  if (change.newImage === undefined) {
    return "REMOVE";
  }

  return change.oldImage === undefined ? "INSERT" : "MODIFY";
}

/**
 * One record on a table's stream: one change, as the stream carries it.
 *
 * A record is fixed once it is written. The images it holds are the items as
 * they were at the moment of the change, rather than references to whatever the
 * table holds now, which is what makes a stream a log of transitions rather
 * than a view of the table.
 */
export class SimDynamoDbStreamRecord {
  public readonly eventId: string;
  public readonly eventName: SimDynamoDbStreamEventName;
  public readonly sequenceNumber: string;
  public readonly approximateCreationDateTime: Date;
  public readonly streamViewType: SimDynamoDbStreamViewType;
  public readonly keys: SimDynamoDbItem;
  public readonly newImage: SimDynamoDbItem | undefined;
  public readonly oldImage: SimDynamoDbItem | undefined;
  public readonly sizeBytes: number;
  public readonly userIdentity: SimDynamoDbStreamUserIdentity | undefined;

  constructor(properties: SimDynamoDbStreamRecordProperties) {
    const { change, viewType } = properties;

    // A change with neither image never happened, and the stream is never told
    // about one, so the item the keys are cut from is always there.
    const changed = change.newImage ?? change.oldImage;
    assertDefined(changed, "DynamoDB stream record item image");

    const images = simDynamoDbStreamImages(change, viewType);

    this.eventId = randomUUID().replaceAll("-", "");
    this.eventName = eventNameOf(change);
    this.sequenceNumber = properties.sequenceNumber;
    this.approximateCreationDateTime = properties.at;
    this.streamViewType = viewType;
    this.keys = simDynamoDbStreamRecordKeys(changed, properties.keySchema);
    this.newImage = images.newImage;
    this.oldImage = images.oldImage;
    this.sizeBytes = simDynamoDbStreamRecordSize(
      [this.keys, images.newImage, images.oldImage].filter(
        (image) => image !== undefined,
      ),
    );
    this.userIdentity = change.expired ? timeToLiveIdentity : undefined;
  }
}

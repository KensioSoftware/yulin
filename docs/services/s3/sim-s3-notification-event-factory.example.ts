/**
 * Making an S3 event notification to call a handler with.
 */

import { VariantFactory } from "@kensio/part-factory";

import { s3NotificationEventFactory, type SimS3Event } from "@kensio/yulin/s3";

function thumbnailKeys(event: SimS3Event): readonly string[] {
  return event.Records.filter((record) =>
    record.eventName.startsWith("ObjectCreated"),
  ).map((record) => `${record.s3.bucket.name}/${record.s3.object.key}`);
}

const uploaded = s3NotificationEventFactory.make({
  Records: [
    { s3: { bucket: { name: "uploads" }, object: { key: "cat.jpg" } } },
  ],
});

// [ 'uploads/cat.jpg' ]
console.log(thumbnailKeys(uploaded));

// A removal is a variation worth naming, since it reports no Object detail.
const objectRemovedFactory = new VariantFactory(s3NotificationEventFactory, {
  Records: [{ eventName: "ObjectRemoved:Delete" }],
});

// []
console.log(thumbnailKeys(objectRemovedFactory.make()));

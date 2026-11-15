/**
 * Tagging a topic and reading its tags back.
 */

import {
  CreateTopicCommand,
  ListTagsForResourceCommand,
  TagResourceCommand,
  UntagResourceCommand,
} from "@aws-sdk/client-sns";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const created = await simAws.sns().createTopic(
  new CreateTopicCommand({
    Name: "orders",
    Tags: [{ Key: "team", Value: "orders" }],
  }),
);

await simAws.sns().tagResource(
  new TagResourceCommand({
    ResourceArn: created.TopicArn,
    Tags: [{ Key: "stage", Value: "test" }],
  }),
);

await simAws.sns().untagResource(
  new UntagResourceCommand({
    ResourceArn: created.TopicArn,
    TagKeys: ["team"],
  }),
);

const listed = await simAws
  .sns()
  .listTagsForResource(
    new ListTagsForResourceCommand({ ResourceArn: created.TopicArn }),
  );

console.log(listed.Tags); // [ { Key: 'stage', Value: 'test' } ]

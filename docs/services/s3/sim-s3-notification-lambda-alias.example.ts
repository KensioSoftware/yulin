/**
 * Notifying a simulated Lambda alias, which runs the version it points at.
 */

import {
  AddPermissionCommand,
  CreateAliasCommand,
  CreateFunctionCommand,
  PublishVersionCommand,
} from "@aws-sdk/client-lambda";
import {
  CreateBucketCommand,
  PutBucketNotificationConfigurationCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws();
const lambda = simAws.lambda();
const thumbnailerArn = `arn:aws:lambda:${simAws.defaultRegionName}:${simAws.defaultAccountId}:function:thumbnailer`;

await simAws.s3().createBucket(new CreateBucketCommand({ Bucket: "uploads" }));

await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "thumbnailer",
    Role: `arn:aws:iam::${simAws.defaultAccountId}:role/ThumbnailerRole`,
    Code: {
      ZipFile: makeLambdaZipFileInput((_event, context) => {
        console.log(context.functionVersion); // "1", the version behind `live`

        return "thumbnailed";
      }),
    },
  }),
);

const published = await lambda.publishVersion(
  new PublishVersionCommand({ FunctionName: "thumbnailer" }),
);

await lambda.createAlias(
  new CreateAliasCommand({
    FunctionName: "thumbnailer",
    Name: "live",
    FunctionVersion: published.Version,
  }),
);

// The grant is made on the alias, which is the resource the notification names.
await lambda.addPermission(
  new AddPermissionCommand({
    FunctionName: "thumbnailer",
    Qualifier: "live",
    StatementId: "AllowS3",
    Action: "lambda:InvokeFunction",
    Principal: "s3.amazonaws.com",
    SourceArn: "arn:aws:s3:::uploads",
    SourceAccount: simAws.defaultAccountId,
  }),
);

await simAws.s3().putBucketNotificationConfiguration(
  new PutBucketNotificationConfigurationCommand({
    Bucket: "uploads",
    NotificationConfiguration: {
      LambdaFunctionConfigurations: [
        {
          Id: "thumbnail-uploads",
          Events: ["s3:ObjectCreated:*"],
          LambdaFunctionArn: `${thumbnailerArn}:live`,
        },
      ],
    },
  }),
);

await simAws
  .s3()
  .putObject(
    new PutObjectCommand({ Bucket: "uploads", Key: "cat.jpg", Body: "cat" }),
  );
await simAws.backgroundTasksComplete();

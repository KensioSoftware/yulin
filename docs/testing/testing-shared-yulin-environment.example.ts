import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import type { SimAws } from "@kensio/yulin";
import { SimSdk } from "@kensio/yulin/sdk";

interface YulinTestEnvironment {
  readonly simAws: SimAws;
  readonly simSdk: SimSdk;
  readonly uploadsBucketName: string;
}

type YulinTestGlobal = typeof globalThis & {
  yulinEnvironment?: Promise<YulinTestEnvironment>;
};

const testGlobal = globalThis as YulinTestGlobal;

// oxlint-disable-next-line unicorn-js/prefer-top-level-await -- The shared promise prevents setup from running again before another test file.
export const yulin = await (testGlobal.yulinEnvironment ??= startYulin());

async function startYulin(): Promise<YulinTestEnvironment> {
  const simSdk = new SimSdk();
  simSdk.intercept(DynamoDBClient);
  simSdk.intercept(S3Client);

  const stacks = await simSdk.simAws.cloudFormation().deployCdkOut({
    directoryPath: "cdk.out",
    stackNames: ["ApplicationStack"],
  });
  const appStack = stacks.get("ApplicationStack");

  if (appStack === undefined) {
    throw new Error("ApplicationStack was not deployed");
  }

  process.once("exit", () => {
    simSdk.restoreAll();
  });

  return {
    simAws: simSdk.simAws,
    simSdk,
    uploadsBucketName: appStack.output("UploadsBucketName"),
  };
}

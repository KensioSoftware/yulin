import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultRegionName: "eu-west-2" });

const stacks = await simAws.cloudFormation().deployCdkOut({
  directoryPath: "cdk.out",
  stackNames: ["ApiStack"],
  stackOptions: {
    ApiStack: {
      parameters: { Stage: "test" },
      bindings: [
        {
          logicalId: "UploadFunction",
          handler: (): { statusCode: number } => ({ statusCode: 200 }),
        },
      ],
    },
  },
});

console.log(stacks.get("ApiStack")?.stackName);

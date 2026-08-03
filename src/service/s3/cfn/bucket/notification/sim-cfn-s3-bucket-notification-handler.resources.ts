import type { SimCfnTemplateValueRecord } from "../../../../cloudformation/template/value/sim-cfn-template-value.js";

/**
 * The Resources standing around a Bucket that notifies a function, which are
 * the same in every test about the NotificationConfiguration property itself.
 */

/**
 * How the template names the function the notification is delivered to.
 */
export const handlerArn: SimCfnTemplateValueRecord = {
  "Fn::GetAtt": ["Handler", "Arn"],
};

/**
 * The execution role the function runs as.
 */
export const handlerRole: SimCfnTemplateValueRecord = {
  Type: "AWS::IAM::Role",
  Properties: {
    RoleName: "thumbnailer-role",
    AssumeRolePolicyDocument: {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { Service: "lambda.amazonaws.com" },
          Action: "sts:AssumeRole",
        },
      ],
    },
  },
};

/**
 * The function the notification is delivered to.
 */
export const handler: SimCfnTemplateValueRecord = {
  Type: "AWS::Lambda::Function",
  Properties: {
    FunctionName: "thumbnailer",
    Role: { "Fn::GetAtt": ["HandlerRole", "Arn"] },
    Code: { ZipFile: "exports.handler = async () => 'thumbnailed';" },
    Handler: "index.handler",
    Runtime: "nodejs20.x",
  },
};

/**
 * The permission letting S3 invoke the function for events from this Bucket.
 *
 * It names the Bucket by ARN literal rather than by `Fn::GetAtt`, because the
 * Bucket already names the function, and CloudFormation refuses the two
 * together as a circular dependency.
 */
export const handlerPermission: SimCfnTemplateValueRecord = {
  Type: "AWS::Lambda::Permission",
  Properties: {
    Action: "lambda:InvokeFunction",
    FunctionName: handlerArn,
    Principal: "s3.amazonaws.com",
    SourceAccount: { Ref: "AWS::AccountId" },
    SourceArn: "arn:aws:s3:::uploads",
  },
};

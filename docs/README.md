# Yulin documentation

Yulin runs simulated AWS services inside a Node.js process. Tests can use AWS SDK clients,
CloudFormation templates, or direct service calls without connecting to AWS. Each `SimAws` instance
holds its own state in memory.

Yulin implements selected AWS behaviour. The service pages describe what each simulation supports
and where it differs from AWS.

## Install Yulin

```bash
npm install --save-dev @kensio/yulin
```

## Choose how to use Yulin

Start with [AWS SDK interception](https://yulinsim.dev/sdk/) when the code under test already uses an
AWS SDK client. Yulin intercepts the client's `send` calls and returns responses from a simulated
service. The application code continues to use the AWS SDK normally.

Use [event factories](https://yulinsim.dev/factories/) when a test calls a handler directly and only
needs an AWS event object. The factories fill in fields that the test does not care about.

Use [CloudFormation](https://yulinsim.dev/services/cloudformation/) to build a simulation from a
template. This also works with templates synthesized by AWS CDK and AWS SAM.

Use the [localhost server](https://yulinsim.dev/serve/) when the code runs in another process or
sends HTTP requests. The [AWS CLI guide](https://yulinsim.dev/cli/) explains how to point AWS CLI
commands at the same endpoint.

Read [simulated time](https://yulinsim.dev/time/) when a test needs to advance a schedule, expire a
credential, or run other work that depends on time passing.

## Service documentation

- [ACM](https://yulinsim.dev/services/acm/ "Simulated ACM usage docs")
- [API Gateway HTTP APIs](https://yulinsim.dev/services/apigatewayv2/ "Simulated API Gateway HTTP API usage docs")
- [API Gateway REST APIs](https://yulinsim.dev/services/apigateway/ "Simulated API Gateway REST API usage docs")
- [Athena](https://yulinsim.dev/services/athena/ "Simulated Amazon Athena usage docs")
- [AWS Backup](https://yulinsim.dev/services/backup/ "Simulated AWS Backup usage docs")
- [Bedrock](https://yulinsim.dev/services/bedrock/ "Simulated Amazon Bedrock usage docs")
- [CloudFormation](https://yulinsim.dev/services/cloudformation/ "Simulated CloudFormation usage docs")
- [CloudFront](https://yulinsim.dev/services/cloudfront/ "Simulated CloudFront usage docs")
- [CloudWatch metrics](https://yulinsim.dev/services/cloudwatch/ "Simulated CloudWatch metrics usage docs")
- [Cognito user pools](https://yulinsim.dev/services/cognito/ "Simulated Cognito user pools usage docs")
- [DynamoDB](https://yulinsim.dev/services/dynamodb/ "Simulated DynamoDB usage docs")
- [ECR](https://yulinsim.dev/services/ecr/ "Simulated ECR usage docs")
- [ECS](https://yulinsim.dev/services/ecs/ "Simulated ECS usage docs")
- [Elastic Load Balancing](https://yulinsim.dev/services/elbv2/ "Simulated Application Load Balancer usage docs")
- [EventBridge](https://yulinsim.dev/services/eventbridge/ "Simulated EventBridge usage docs")
- [Glue](https://yulinsim.dev/services/glue/ "Simulated Glue Data Catalog usage docs")
- [IAM](https://yulinsim.dev/services/iam/ "Simulated IAM usage docs")
- [Kinesis Data Firehose](https://yulinsim.dev/services/firehose/ "Simulated Kinesis Data Firehose usage docs")
- [Kinesis Data Streams](https://yulinsim.dev/services/kinesis/ "Simulated Kinesis Data Streams usage docs")
- [KMS](https://yulinsim.dev/services/kms/ "Simulated KMS usage docs")
- [Lambda](https://yulinsim.dev/services/lambda/ "Simulated Lambda usage docs")
- [CloudWatch Logs](https://yulinsim.dev/services/logs/ "Simulated CloudWatch Logs usage docs")
- [Organizations](https://yulinsim.dev/services/organizations/ "Simulated Organizations service control policies usage docs")
- [Personalize](https://yulinsim.dev/services/personalize/ "Simulated Amazon Personalize usage docs")
- [Rekognition](https://yulinsim.dev/services/rekognition/ "Simulated Rekognition usage docs")
- [Route53](https://yulinsim.dev/services/route53/ "Simulated Route53 usage docs")
- [S3](https://yulinsim.dev/services/s3/ "Simulated S3 usage docs")
- [Scheduler](https://yulinsim.dev/services/scheduler/ "Simulated EventBridge Scheduler usage docs")
- [Secrets Manager](https://yulinsim.dev/services/secretsmanager/ "Simulated Secrets Manager usage docs")
- [SES](https://yulinsim.dev/services/ses/ "Simulated SES usage docs")
- [SNS](https://yulinsim.dev/services/sns/ "Simulated SNS usage docs")
- [SQS](https://yulinsim.dev/services/sqs/ "Simulated SQS usage docs")
- [SSM Parameter Store](https://yulinsim.dev/services/ssm/ "Simulated SSM Parameter Store usage docs")
- [Step Functions](https://yulinsim.dev/services/stepfunctions/ "Simulated Step Functions usage docs")
- [STS](https://yulinsim.dev/services/sts/ "Simulated STS usage docs")
- [WAFv2](https://yulinsim.dev/services/wafv2/ "Simulated WAFv2 usage docs")

## Feature guides

- [AI skill](https://yulinsim.dev/ai-skill/ "Yulin AI skill usage docs")
- [The AWS CLI](https://yulinsim.dev/cli/ "The AWS CLI against simulated AWS usage docs")
- [AWS SDK interception](https://yulinsim.dev/sdk/ "Simulated AWS SDK usage docs")
- [Event factories](https://yulinsim.dev/factories/ "Test factories for AWS event shapes usage docs")
- [Linting CloudFront Functions JS2](https://yulinsim.dev/lint/ "CloudFront Functions JS2 lint config usage docs")
- [Non-AWS dependencies](https://yulinsim.dev/non-aws-dependencies/ "Dependencies Yulin does not simulate usage docs")
- [Serving on localhost](https://yulinsim.dev/serve/ "Serving simulated AWS on localhost usage docs")
- [Simulated time](https://yulinsim.dev/time/ "Simulated time usage docs")
- [Terraform](https://yulinsim.dev/terraform/ "Deploying Terraform into simulated AWS usage docs")

import type { SimAws } from "../sim-aws.js";
import { SimAwsS3NotificationFunctions } from "../../s3/notification/destination/lambda/sim-aws-s3-notification-functions.js";
import { SimS3LambdaNotificationDestination } from "../../s3/notification/destination/lambda/sim-s3-lambda-notification-destination.js";
import { SimS3ServiceNotificationDestinations } from "../../s3/notification/destination/sim-s3-service-notification-destinations.js";
import { SimAwsS3NotificationQueues } from "../../s3/notification/destination/sqs/sim-aws-s3-notification-queues.js";
import { SimS3SqsNotificationDestination } from "../../s3/notification/destination/sqs/sim-s3-sqs-notification-destination.js";

/**
 * Where a simulated S3 Bucket can send its event notifications.
 *
 * A notification configuration names a destination by ARN, and that ARN can
 * name any Account and Region, so the destinations come from the whole
 * simulation rather than from the scope the Bucket belongs to.
 */
export function simAwsS3NotificationDestinations(
  simAws: SimAws,
): SimS3ServiceNotificationDestinations {
  return new SimS3ServiceNotificationDestinations({
    lambda: new SimS3LambdaNotificationDestination({
      functions: new SimAwsS3NotificationFunctions({ simAws }),
    }),
    sqs: new SimS3SqsNotificationDestination({
      queues: new SimAwsS3NotificationQueues({ simAws }),
    }),
  });
}

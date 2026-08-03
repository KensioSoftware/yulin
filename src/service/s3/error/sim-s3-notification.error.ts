/**
 * A destination that would not take an event when it was offered one.
 *
 * This is not an AWS API error: nothing is waiting for it, because real S3
 * never reports a failed delivery to whoever wrote the Object. It exists so
 * the delivery outcome can say why nothing arrived, rather than the event
 * simply disappearing.
 */
export class SimS3NotificationNotPermitted extends Error {
  public override readonly name = "SimS3NotificationNotPermitted";
}

/**
 * The simulation delivered more notifications than it is willing to.
 *
 * A handler that writes back into the Bucket that triggered it is a loop, and
 * in process it is a loop with nothing to slow it down: `backgroundTasksComplete()`
 * drains until there is no work left, so the test hangs with no stack to read.
 * This is the one delivery failure allowed to escape its background task, so
 * the loop surfaces as a named failure instead.
 */
export class SimS3NotificationDeliveryLimit extends Error {
  public override readonly name = "SimS3NotificationDeliveryLimit";
}

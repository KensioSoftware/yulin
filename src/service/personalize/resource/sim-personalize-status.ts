/**
 * The status simulated Personalize gives every resource it creates.
 *
 * Real Personalize walks a resource through `CREATE PENDING` and
 * `CREATE IN_PROGRESS` before it reaches `ACTIVE`, and training a solution
 * version takes tens of minutes to do it. Nothing trains here, so a resource
 * is active from the moment it is created and a test never polls.
 */
export const simPersonalizeActiveStatus = "ACTIVE";

/**
 * The status a stopped recommender reports.
 *
 * Real Personalize walks a recommender through `STOP PENDING` and
 * `STOP IN_PROGRESS` before it settles here, and back through `START PENDING`
 * on the way out. Neither takes any time here.
 */
export const simPersonalizeInactiveStatus = "INACTIVE";

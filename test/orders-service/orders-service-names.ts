/**
 * The names the orders service is deployed under.
 *
 * They are here rather than in the template so that a test asserting on one
 * reads it from the same place the template writes it.
 */
export const ordersServiceNames = {
  stack: "orders",
  table: "orders",
  cluster: "orders",
  family: "orders-api",
  service: "orders-api",
  /** The container the application runs in, alongside an unsimulated proxy. */
  container: "app",
  proxy: "nginx",
  /** The port the proxy listens on, which is the one the service registers. */
  proxyPort: 80,
  /** The port the application listens on behind the proxy. */
  applicationPort: 8080,
  zone: "example.test",
  hostname: "orders.example.test",
} as const;

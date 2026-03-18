export type Brand<K, T extends string> = K & Record<T, never>;

export type ISODateString = Brand<
  `${number}-${number}-${number}T${number}:${number}:${number}.${number}Z`,
  "ISODateString"
>;
declare global {
  interface Date {
    toISOString(): ISODateString;
  }
}

export interface CommandHandler<TCommand, TOutput> {
  handle(cmd: TCommand): Promise<TOutput>;
}

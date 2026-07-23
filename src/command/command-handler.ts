export interface CommandHandler<TCommand, TOutput> {
  handle(command: TCommand): Promise<TOutput>;
}

class CommandDispatcher {
  constructor() {
    this.commands = new Map();
  }

  register(name, handler) {
    this.commands.set(name, handler);
  }

  async dispatch(ctx, input) {
    const [command, ...args] = input.trim().split(" ");
    const handler = this.commands.get(command);

    if (!handler) {
      return { error: `Unknown command: ${command}` };
    }

    return await handler(ctx, args);
  }
}

module.exports = CommandDispatcher;

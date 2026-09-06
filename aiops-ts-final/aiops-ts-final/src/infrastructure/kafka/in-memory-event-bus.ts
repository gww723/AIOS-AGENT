import type { EventBus } from "./event-bus.js";

export class InMemoryEventBus implements EventBus {
  private handlers = new Map<string, Array<(event: unknown) => Promise<void>>>();
  private queue: Array<{ topic: string; event: unknown }> = [];
  private draining = false;
  async connect() {}
  async disconnect() {}
  async publish(topic: string, _key: string, event: unknown) {
    this.queue.push({ topic, event });
    await this.drain();
  }
  async subscribe(topic: string, _groupId: string, handler: (event: unknown) => Promise<void>) {
    const list = this.handlers.get(topic) ?? [];
    list.push(handler);
    this.handlers.set(topic, list);
  }
  private async drain() {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length) {
        const item = this.queue.shift()!;
        for (const handler of this.handlers.get(item.topic) ?? []) await handler(item.event);
      }
    } finally { this.draining = false; }
  }
}

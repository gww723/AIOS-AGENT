export interface EventBus {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  publish(topic: string, key: string, event: unknown): Promise<void>;
  subscribe(topic: string, groupId: string, handler: (event: unknown) => Promise<void>): Promise<void>;
}

import { Kafka, logLevel, type Consumer, type Producer } from "kafkajs";
import type { EventBus } from "./event-bus.js";

export class KafkaEventBus implements EventBus {
  private kafka: Kafka;
  private producer: Producer;
  private consumers: Consumer[] = [];
  constructor() {
    const brokers = (process.env.KAFKA_BROKERS ?? "localhost:9092").split(",").map((x) => x.trim());
    this.kafka = new Kafka({ clientId: "aiops-ts", brokers, logLevel: logLevel.WARN });
    this.producer = this.kafka.producer();
  }
  async connect() { await this.producer.connect(); }
  async disconnect() { await Promise.all(this.consumers.map((c) => c.disconnect())); await this.producer.disconnect(); }
  async publish(topic: string, key: string, event: unknown) {
    await this.producer.send({ topic, messages: [{ key, value: JSON.stringify(event) }] });
  }
  async subscribe(topic: string, groupId: string, handler: (event: unknown) => Promise<void>) {
    const consumer = this.kafka.consumer({ groupId });
    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: false });
    await consumer.run({ eachMessage: async ({ message }) => {
      if (!message.value) return;
      const event = JSON.parse(message.value.toString());
      await handler(event);
    }});
    this.consumers.push(consumer);
  }
}

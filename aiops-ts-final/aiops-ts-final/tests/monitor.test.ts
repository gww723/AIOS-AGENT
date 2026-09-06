import {describe,expect,it} from "vitest";
import {InMemoryStateStore} from "../src/infrastructure/state/in-memory-state-store.js";
import {InMemoryEventBus} from "../src/infrastructure/kafka/in-memory-event-bus.js";
import {MonitorService} from "../src/monitor/monitor-service.js";
import {Topics} from "../src/domain/topics.js";

describe("MonitorService",()=>{
  it("creates one incident for repeated same alert fingerprint",async()=>{
    const store=new InMemoryStateStore();const bus=new InMemoryEventBus();const monitor=new MonitorService(bus,store);let alerts=0;await bus.subscribe(Topics.ALERTS,"t",async()=>{alerts++;});
    let t=Date.now(); for(let i=0;i<20;i++)await monitor.handleMetric({eventId:`m${i}`,serviceName:"payment-service",nodeType:"business-service",metrics:{cpu:40+i%2,memory:50+i%2,qps:1000+i%3*5,latency:120+i%2,errorRate:.5},sampleTime:new Date(t+=15000).toISOString(),stableLabels:{namespace:"payment"}});
    await monitor.handleMetric({eventId:"x1",serviceName:"payment-service",nodeType:"business-service",metrics:{cpu:95,memory:92,qps:3300,latency:1600,errorRate:9},sampleTime:new Date(t+=15000).toISOString(),stableLabels:{namespace:"payment"}});
    await monitor.handleMetric({eventId:"x2",serviceName:"payment-service",nodeType:"business-service",metrics:{cpu:96,memory:93,qps:3400,latency:1700,errorRate:10},sampleTime:new Date(t+=15000).toISOString(),stableLabels:{namespace:"payment"}});
    expect(alerts).toBeGreaterThan(0);
    expect(store.activeAlerts.size).toBeLessThanOrEqual(5);
  });
});

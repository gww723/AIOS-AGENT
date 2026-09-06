import { ExecutionCommandSchema, ExecutionResultSchema } from "../domain/events.js";
import { Topics } from "../domain/topics.js";
import type { EventBus } from "../infrastructure/kafka/event-bus.js";
import type { StateStore } from "../infrastructure/state/state-store.js";
import type { ActionExecutor } from "../infrastructure/executor/action-executor.js";
import { newId } from "../shared/ids.js";
import { nowIso } from "../shared/time.js";

export class ExecutionEngine {
  constructor(private readonly bus:EventBus,private readonly store:StateStore,private readonly executor:ActionExecutor){}
  async handle(raw:unknown){const cmd=ExecutionCommandSchema.parse(raw);const consumer="execution-engine";if(await this.store.isProcessed(cmd.eventId,consumer))return;const startedAt=nowIso();let status:"SUCCESS"|"FAILED"="SUCCESS";let error:string|null=null;try{const pre=await this.executor.dryRun(cmd.targetNode,cmd.action,cmd.params);if(!pre.ok)throw new Error(pre.reason);await this.store.updateRepairAttempt(cmd.executionId,{status:"RUNNING",startedAt});await this.executor.execute(cmd.targetNode,cmd.action,cmd.params);}catch(e){status="FAILED";error=e instanceof Error?e.message:String(e);}const result=ExecutionResultSchema.parse({eventId:newId("exec-result"),incidentId:cmd.incidentId,primaryIncidentId:cmd.primaryIncidentId,executionId:cmd.executionId,status,action:cmd.action,params:cmd.params,startedAt,completedAt:nowIso(),error});await this.store.markProcessed(cmd.eventId,consumer);await this.bus.publish(Topics.EXECUTION_EVENTS,cmd.primaryIncidentId,result);}
}

export interface ChangeEvidence { type:string; version?:string; occurredAt:string; summary:string; }
export interface ChangeProvider { query(node:string,start:string,end:string):Promise<ChangeEvidence[]>; }

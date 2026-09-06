export interface ActionExecutor { dryRun(node:string,action:string,params:Record<string,unknown>):Promise<{ok:boolean;reason:string}>; execute(node:string,action:string,params:Record<string,unknown>):Promise<void>; }
export class SimulatorHttpExecutor implements ActionExecutor {
  constructor(private readonly baseUrl=process.env.SIMULATOR_ADMIN_URL??"http://localhost:9200"){}
  async dryRun(node:string,action:string,_params:Record<string,unknown>){return {ok:!!node&&!!action,reason:"仿真执行器参数合法"};}
  async execute(node:string,_action:string,_params:Record<string,unknown>){const res=await fetch(`${this.baseUrl}/fault/${encodeURIComponent(node)}/normal`,{method:"POST"}); if(!res.ok)throw new Error(`simulator execute failed ${res.status}`);}
}

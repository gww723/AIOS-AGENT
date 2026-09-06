import type { LogProvider } from "./log-provider.js";
export class LokiClient implements LogProvider {
  constructor(private readonly baseUrl=process.env.LOKI_URL??"http://localhost:3100"){}
  async query(node:string,start:string,end:string,keywords:string[]=[]){
    let query=`{service="${node}"}`; for(const k of keywords) query+=` |= "${k.replaceAll('"','\\"')}"`;
    const params=new URLSearchParams({query,start:String(new Date(start).getTime()*1_000_000),end:String(new Date(end).getTime()*1_000_000),limit:"200",direction:"forward"});
    const res=await fetch(`${this.baseUrl}/loki/api/v1/query_range?${params}`); if(!res.ok) throw new Error(`Loki query failed ${res.status}`); const body:any=await res.json();
    const out:string[]=[]; for(const stream of body.data?.result??[]) for(const [,line] of stream.values??[]) out.push(String(line)); return out;
  }
}

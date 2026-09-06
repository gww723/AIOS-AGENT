import type { LogProvider } from "./log-provider.js";
export class InMemoryLogProvider implements LogProvider {
  logs=new Map<string,Array<{time:string;line:string}>>();
  add(node:string,time:string,line:string){this.logs.set(node,[...(this.logs.get(node)??[]),{time,line}]);}
  async query(node:string,start:string,end:string,keywords:string[]=[]){const s=new Date(start).getTime(),e=new Date(end).getTime();return (this.logs.get(node)??[]).filter(x=>{const t=new Date(x.time).getTime();return t>=s&&t<=e&&(keywords.length===0||keywords.some(k=>x.line.includes(k)));}).map(x=>x.line);}
}

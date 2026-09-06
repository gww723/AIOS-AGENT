import type { TopologyProvider, TopologyResult } from "./topology-provider.js";
export class InMemoryTopologyProvider implements TopologyProvider {
  constructor(public readonly nodeTypes:Record<string,string>,public readonly edges:Array<{from:string;to:string}>){ }
  async oneHop(node:string):Promise<TopologyResult>{
    const related=this.edges.filter(e=>e.from===node||e.to===node); const names=new Set([node,...related.flatMap(e=>[e.from,e.to])]);
    return {center:node,nodes:[...names].map(name=>({name,type:this.nodeTypes[name]??"unknown"})),edges:related};
  }
}

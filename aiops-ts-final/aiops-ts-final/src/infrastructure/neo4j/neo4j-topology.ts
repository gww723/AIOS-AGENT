import neo4j, { type Driver } from "neo4j-driver";
import type { TopologyProvider, TopologyResult } from "./topology-provider.js";

export class Neo4jTopologyProvider implements TopologyProvider {
  private driver: Driver;
  constructor(){this.driver=neo4j.driver(process.env.NEO4J_URL??"bolt://localhost:7687",neo4j.auth.basic(process.env.NEO4J_USER??"neo4j",process.env.NEO4J_PASSWORD??"aiops12345"));}
  async oneHop(node:string):Promise<TopologyResult>{
    const session=this.driver.session();
    try{
      const result=await session.run(`MATCH (c {name:$name}) OPTIONAL MATCH (c)-[r:DEPENDS_ON]-(n) RETURN c,n,r`,{name:node});
      const nodes=new Map<string,{name:string;type:string}>(); const edges=new Map<string,{from:string;to:string}>();
      for(const record of result.records){
        const c=record.get("c"); if(c) nodes.set(c.properties.name,{name:c.properties.name,type:c.properties.type??"unknown"});
        const n=record.get("n"); if(n) nodes.set(n.properties.name,{name:n.properties.name,type:n.properties.type??"unknown"});
        const r=record.get("r"); if(r&&c&&n){
          const start=r.start.toString()===c.identity.toString()?c:n; const end=start===c?n:c;
          edges.set(`${start.properties.name}->${end.properties.name}`,{from:start.properties.name,to:end.properties.name});
        }
      }
      return {center:node,nodes:[...nodes.values()],edges:[...edges.values()]};
    }finally{await session.close();}
  }
  async close(){await this.driver.close();}
}

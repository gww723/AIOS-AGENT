export interface LogProvider { query(node:string,start:string,end:string,keywords?:string[]):Promise<string[]>; }

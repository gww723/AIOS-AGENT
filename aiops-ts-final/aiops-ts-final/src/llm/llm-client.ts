export interface LlmClient {
  completeJson<T>(systemPrompt:string,userPrompt:string):Promise<T>;
}

export class OpenAICompatibleLlmClient implements LlmClient {
  constructor(private readonly baseUrl=process.env.LLM_BASE_URL??"",private readonly apiKey=process.env.LLM_API_KEY??"",private readonly model=process.env.LLM_MODEL??""){}
  async completeJson<T>(systemPrompt:string,userPrompt:string):Promise<T>{
    if(!this.baseUrl||!this.model) throw new Error("LLM_BASE_URL / LLM_MODEL not configured");
    const res=await fetch(`${this.baseUrl.replace(/\/$/,"")}/chat/completions`,{method:"POST",headers:{"content-type":"application/json",...(this.apiKey?{authorization:`Bearer ${this.apiKey}`}:{})},body:JSON.stringify({model:this.model,temperature:0,messages:[{role:"system",content:systemPrompt},{role:"user",content:userPrompt}],response_format:{type:"json_object"}})});
    if(!res.ok) throw new Error(`LLM request failed ${res.status}: ${await res.text()}`);
    const body:any=await res.json(); const text=body.choices?.[0]?.message?.content; if(!text) throw new Error("LLM returned empty content"); return JSON.parse(text) as T;
  }
}

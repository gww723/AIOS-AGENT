import express from "express";
import type { ChangeAgentService } from "./change-agent.js";
export function startApprovalApi(change:ChangeAgentService,port=Number(process.env.APPROVAL_API_PORT??9300)){
  const app=express();app.use(express.json());
  app.post("/change/approvals/:executionId/approve",async(req,res)=>{try{await change.approve(req.params.executionId);res.json({ok:true,status:"approved"});}catch(e){res.status(404).json({ok:false,error:e instanceof Error?e.message:String(e)});}});
  app.post("/change/approvals/:executionId/reject",async(req,res)=>{try{await change.reject(req.params.executionId);res.json({ok:true,status:"rejected"});}catch(e){res.status(404).json({ok:false,error:e instanceof Error?e.message:String(e)});}});
  return app.listen(port,"0.0.0.0",()=>console.log(`[change-approval-api] :${port}`));
}

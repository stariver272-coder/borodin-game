import {env} from "cloudflare:workers";
import {characters} from "@/lib/story";
import {GameError} from "@/lib/engine";
import {database,json,failure,sameSite} from "@/lib/http";
export const dynamic="force-dynamic";
function owner(req:Request){const id=req.headers.get("oai-authenticated-user-id");if(!id)throw new GameError("请先登录后管理人物素材。",401);return id;}
async function list(id:string){const r=await database().prepare("SELECT character,object_key FROM portraits WHERE owner=?").bind(id).all<{character:string;object_key:string}>();return Object.fromEntries(r.results.map(v=>[v.character,"/api/images/"+v.object_key]));}
export async function GET(req:Request){try{return json(await list(owner(req)));}catch(e){return failure(e);}}
export async function POST(req:Request){
 try{
  sameSite(req);const user=owner(req);if(!env.BUCKET)throw new GameError("图片服务尚未就绪。",503);
  if(Number(req.headers.get("content-length"))>5*1024*1024+20000)throw new GameError("图片请控制在 5MB 以内。");
  const form=await req.formData(),character=String(form.get("character")??""),file=form.get("file");
  if(!characters.some(c=>c.id===character))throw new GameError("未找到这个人物。");
  if(!(file instanceof File) || !file.size || file.size>5*1024*1024)throw new GameError("请选择一张 5MB 以内的图片。");
  const data=await file.arrayBuffer(),b=new Uint8Array(data);
  const png=b.length>8&&[137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v),jpeg=b[0]===255&&b[1]===216&&b[2]===255,webp=String.fromCharCode(...b.slice(0,4))==="RIFF"&&String.fromCharCode(...b.slice(8,12))==="WEBP";
  if(!png&&!jpeg&&!webp)throw new GameError("请上传 PNG、JPG 或 WebP 图片。");
  const key=crypto.randomUUID()+"."+(png?"png":jpeg?"jpg":"webp");
  await env.BUCKET.put(key,data,{httpMetadata:{contentType:png?"image/png":jpeg?"image/jpeg":"image/webp"}});
  const db=database(),old=await db.prepare("SELECT object_key FROM portraits WHERE owner=? AND character=?").bind(user,character).first<{object_key:string}>();
  try{await db.prepare("INSERT INTO portraits(owner,character,object_key) VALUES(?,?,?) ON CONFLICT(owner,character) DO UPDATE SET object_key=excluded.object_key").bind(user,character,key).run();}catch(e){await env.BUCKET.delete(key);throw e;}
  if(old)await env.BUCKET.delete(old.object_key);
  return json(await list(user));
 }catch(e){return failure(e);}
}
export async function DELETE(req:Request){try{
 sameSite(req);const user=owner(req),character=new URL(req.url).searchParams.get("character")??"",db=database();
 const old=await db.prepare("SELECT object_key FROM portraits WHERE owner=? AND character=?").bind(user,character).first<{object_key:string}>();
 await db.prepare("DELETE FROM portraits WHERE owner=? AND character=?").bind(user,character).run();
 if(old&&env.BUCKET)await env.BUCKET.delete(old.object_key);
 return json(await list(user));
}catch(e){return failure(e);}}

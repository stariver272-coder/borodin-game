import {env} from "cloudflare:workers";
export async function GET(_request:Request,context:{params:Promise<{key:string}>}){
 const {key}=await context.params;
 if(!/^[0-9a-f-]{36}\.(png|jpg|webp)$/.test(key)||!env.BUCKET)return new Response("Not found",{status:404});
 const object=await env.BUCKET.get(key);if(!object)return new Response("Not found",{status:404});
 const headers=new Headers();object.writeHttpMetadata(headers);headers.set("X-Content-Type-Options","nosniff");headers.set("Cache-Control","private, max-age=3600");
 return new Response(object.body,{headers});
}

import { env } from "cloudflare:workers";
import { GameError } from "./engine";
export function database() { if(!env.DB) throw new GameError("房间服务尚未就绪，请稍后刷新。",503);return env.DB; }
export function bearer(request:Request) { return request.headers.get("authorization")?.replace(/^Bearer /,"")??""; }
export function json(value:unknown,status=200) {return Response.json(value,{status,headers:{"Cache-Control":"no-store"}});}
export function failure(error:unknown) { if(error instanceof GameError)return json({error:error.message},error.status); console.error("Game service error",error instanceof Error?error.message:"unknown"); return json({error:"服务暂时没有响应，请稍后重试。"},500); }
export function sameSite(request:Request) { const origin=request.headers.get("origin");if(request.headers.get("sec-fetch-site")==="cross-site" || (origin && origin!==new URL(request.url).origin)) throw new GameError("请在游戏网页中进行操作。",403); }

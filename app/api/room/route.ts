import {createRoom,joinRoom,roomState,controlRoom,castVote,exportResults,GameError} from "@/lib/engine";
import {database,bearer,json,failure,sameSite} from "@/lib/http";
export const dynamic="force-dynamic";
export async function GET(request:Request) {try{const url=new URL(request.url);return json(await roomState(database(),url.searchParams.get("code")??"",bearer(request)));}catch(e){return failure(e);}}
export async function POST(request:Request) {
  try {
    sameSite(request);const raw=await request.text();if(raw.length>10000)throw new GameError("请求内容过长。");
    let body;try{body=JSON.parse(raw);}catch{throw new GameError("请求格式无效。");}
    if(!body || typeof body!=="object")throw new GameError("请求格式无效。");
    const db=database(),token=bearer(request),code=String(body.code??"");
    if(body.action==="create")return json(await createRoom(db,request.headers.get("oai-authenticated-user-id")??"",String(body.title??"")));
    if(body.action==="join")return json(await joinRoom(db,code,String(body.name??"")));
    if(body.action==="control")await controlRoom(db,code,token,String(body.command),Number(body.version));
    else if(body.action==="vote")await castVote(db,code,token,String(body.poll),String(body.choice),String(body.reason??""));
    else if(body.action==="export")return json(await exportResults(db,code,token));
    else throw new GameError("未知操作。");
    return json(await roomState(db,code,token));
  }catch(e){return failure(e);}
}

import { scenes, polls, pollSteps } from "./story";
import type { RoomState, Result } from "./types";
import {hostOnline,heartbeat,closePresence,validPresenceId,HOST_TIMEOUT_MS} from "./presence";
type Room = {code: string; owner: string; host_hash: string; title: string; status: string; step: number; phase: string; version: number; created_at: number};
type Player = {id: string; room: string; name: string; token_hash: string; last_seen: number};
type Ballot = {poll: string; player: string; choice: string; reason: string; name: string};
export class GameError extends Error { constructor(message: string, public status = 400) {super(message);} }
export async function digest(value: string) { return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), b => b.toString(16).padStart(2,"0")).join(""); }
function secret() { return crypto.randomUUID() + crypto.randomUUID(); }
export function normalizeCode(code: unknown) { if(typeof code !== "string" || !/^[A-Z2-9]{6}$/.test(code.trim().toUpperCase())) throw new GameError("请填写 6 位房间码。"); return code.trim().toUpperCase(); }
export async function createRoom(db: D1Database, owner: string, title: string) {
  if(!owner) throw new GameError("请先登录后创建主持人房间。",401);
  const now=Date.now();
  const recent=await db.prepare("SELECT count(*) AS n FROM rooms WHERE owner=? AND created_at>?").bind(owner,now-3600000).first<{n:number}>();
  if((recent?.n??0)>=30) throw new GameError("这一小时创建的房间较多，请使用已有房间或稍后再试。",429);
  const token=secret(), hash=await digest(token), alphabet="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for(let attempt=0;attempt<5;attempt++) {
    const code=Array.from(crypto.getRandomValues(new Uint8Array(6)), b => alphabet[b % alphabet.length]).join("");
    const r=await db.prepare("INSERT OR IGNORE INTO rooms(code,owner,host_hash,title,created_at) VALUES(?,?,?,?,?)").bind(code,owner,hash,title.trim().slice(0,40)||"三次抉择 · 共读房间",now).run();
    if(r.meta.changes) return {code, token, role:"host" as const};
  }
  throw new GameError("暂时无法创建房间，请重试。",503);
}
export async function getRoom(db: D1Database, code: string) {
  const r=await db.prepare("SELECT * FROM rooms WHERE code=?").bind(normalizeCode(code)).first<Room>();
  if(!r) throw new GameError("没有找到这个房间，请检查房间码。",404);
  return r;
}
export async function joinRoom(db: D1Database, code: string, name: string) {
  const room=await getRoom(db,code);
  if(room.status==="finished") throw new GameError("本场已经结束，请向主持人索取新房间码。");
  const trimmed=name.trim();
  if(!trimmed || trimmed.length>16) throw new GameError("昵称请填写 1–16 个字。");
  const id=crypto.randomUUID(), token=secret(), now=Date.now();
  const r=await db.prepare("INSERT INTO players(id,room,name,token_hash,last_seen,created_at) SELECT ?,?,?,?,?,? WHERE (SELECT count(*) FROM players WHERE room=?) < 100 AND (SELECT status FROM rooms WHERE code=?) != 'finished'").bind(id,room.code,trimmed,await digest(token),now,now,room.code,room.code).run();
  if(!r.meta.changes) throw new GameError("房间已结束或已达到 100 个参与身份的上限。");
  return {code:room.code,token,role:"player" as const,name:trimmed};
}
async function authorize(db:D1Database, room:Room, token:string) {
  if(!token) throw new GameError("请先加入房间。",401);
  const hash=await digest(token);
  if(hash===room.host_hash) return {role:"host" as const, player:null};
  const player=await db.prepare("SELECT * FROM players WHERE room=? AND token_hash=?").bind(room.code,hash).first<Player>();
  if(!player) throw new GameError("参与身份已失效，请重新加入房间。",401);
  return {role:"player" as const, player};
}
export async function leaveRoom(db:D1Database, code:string, token:string, presenceId:string) {
  const room=await getRoom(db,code),auth=await authorize(db,room,token);
  if(auth.role!=="host") throw new GameError("只有主持人可以更改主持人在线状态。",403);
  if(!validPresenceId(presenceId)) throw new GameError("页面身份无效，请刷新后重试。");
  await closePresence(db,room.code,presenceId);
}
export async function roomState(db:D1Database, code:string, token:string, presenceId?:string):Promise<RoomState> {
  const room=await getRoom(db,code), auth=await authorize(db,room,token), now=Date.now();
  if(presenceId!==undefined) {
    if(auth.role!=="host") throw new GameError("只有主持人可以更改主持人在线状态。",403);
    if(!validPresenceId(presenceId)) throw new GameError("页面身份无效，请刷新后重试。");
    if(room.status!=="finished") await heartbeat(db,room.code,presenceId);
  }
  const online=room.status!=="finished" && await hostOnline(db,room.code);
  if(online && auth.player && now-auth.player.last_seen>10000) await db.prepare("UPDATE players SET last_seen=? WHERE id=?").bind(now,auth.player.id).run();
  const [people,votes,images]=await Promise.all([
    db.prepare("SELECT id,name,last_seen FROM players WHERE room=? ORDER BY created_at,id").bind(room.code).all<{id:string;name:string;last_seen:number}>(),
    db.prepare("SELECT b.poll,b.player,b.choice,b.reason,p.name FROM ballots b JOIN players p ON p.id=b.player WHERE b.room=? ORDER BY b.updated_at").bind(room.code).all<Ballot>(),
    db.prepare("SELECT character,object_key FROM portraits WHERE owner=?").bind(room.owner).all<{character:string;object_key:string}>()
  ]);
  const current=scenes[room.step], currentPoll=current?.type==="poll"?current.poll:null;
  const all=votes.results, currentVotes=all.filter(v=>v.poll===currentPoll), mine=currentVotes.find(v=>v.player===auth.player?.id);
  const results:Record<string,Result>={};
  for(const [id,step] of Object.entries(pollSteps)) {
    if(step>room.step || (step===room.step && room.phase!=="closed")) continue;
    const rows=all.filter(v=>v.poll===id), counts=Object.fromEntries(polls[id].options.map(o=>[o.key,rows.filter(v=>v.choice===o.key).length]));
    const max=Math.max(...Object.values(counts));
    results[id]={counts,total:rows.length,winners:rows.length?Object.keys(counts).filter(k=>counts[k]===max):[],reasons:rows.filter(v=>v.reason).map(v=>({name:v.name,choice:v.choice,reason:v.reason}))};
  }
  return {room:{code:room.code,title:room.title,status:room.status,step:room.step,phase:room.phase,version:room.version},role:auth.role,hostOnline:online,
    players:people.results.map(p=>({id:p.id,name:p.name,online:now-p.last_seen<30000 || p.id===auth.player?.id,voted:currentVotes.some(v=>v.player===p.id)})),
    portraits:Object.fromEntries(images.results.map(i=>[i.character,"/api/images/"+i.object_key])),submitted:currentVotes.length,
    myVote:mine?{choice:mine.choice,reason:mine.reason}:null,results};
}
export async function controlRoom(db:D1Database, code:string, token:string, command:string, version:number) {
  const room=await getRoom(db,code), auth=await authorize(db,room,token);
  if(auth.role!=="host") throw new GameError("只有主持人可以推进剧情或控制投票。",403);
  if(room.version!==version) throw new GameError("房间进度刚刚更新，请重试。",409);
  let {step,status,phase}=room;const scene=scenes[step];
  if(command==="start" && status==="lobby") {status="playing";}
  else if(command==="open" && status==="playing" && scene.type==="poll" && phase==="read") {phase="open";}
  else if(command==="close" && status==="playing" && scene.type==="poll" && phase==="open") {phase="closed";}
  else if(command==="next" && status==="playing" && scene.type!=="summary" && (scene.type!=="poll" || phase==="closed")) {step++;phase="read";}
  else if(command==="finish" && status==="playing" && scene.type==="summary") {status="finished";}
  else throw new GameError("当前阶段不能进行这项操作。请先完成本轮投票。",409);
  const result=await db.prepare("UPDATE rooms SET step=?,status=?,phase=?,version=version+1 WHERE code=? AND version=?").bind(step,status,phase,room.code,version).run();
  if(!result.meta.changes) throw new GameError("另一处主持人页面已更新进度，请重试。",409);
}
export async function castVote(db:D1Database, code:string, token:string, poll:string, choice:string, reason:string) {
  const room=await getRoom(db,code), auth=await authorize(db,room,token);
  if(!auth.player) throw new GameError("主持人不计票。请使用玩家入口加入后投票。",403);
  if(!Object.hasOwn(polls,poll) || !polls[poll].options.some(o=>o.key===choice)) throw new GameError("无效的投票选项。");
  if(reason.length>300) throw new GameError("理由请控制在 300 字以内。");
  const now=Date.now();
  const r=await db.prepare("INSERT INTO ballots(room,poll,player,choice,reason,updated_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM rooms WHERE code=? AND status='playing' AND step=? AND phase='open') AND EXISTS(SELECT 1 FROM room_host_presence WHERE room=? AND closed=0 AND seen_at>?) ON CONFLICT(room,poll,player) DO UPDATE SET choice=excluded.choice,reason=excluded.reason,updated_at=excluded.updated_at").bind(room.code,poll,auth.player.id,choice,reason.trim(),now,room.code,pollSteps[poll],room.code,now-HOST_TIMEOUT_MS).run();
  if(!r.meta.changes) throw new GameError("主持人已离线，或本轮投票尚未开启、已经截止。",409);
}
export async function exportResults(db:D1Database, code:string, token:string) {
  const state=await roomState(db,code,token);
  if(state.role!=="host") throw new GameError("只有主持人可以导出记录。",403);
  return {room:state.room,results:state.results,exportedAt:new Date().toISOString()};
}

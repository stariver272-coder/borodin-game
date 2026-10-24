import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {compileStory} from '../scripts/story-document.mjs';
compileStory();
const require=createRequire(import.meta.url);
const {build}=require(require.resolve('esbuild',{paths:[require.resolve('vite')]}));
mkdirSync('.sites-runtime',{recursive:true});
await build({entryPoints:['tests/http-entry.ts'],bundle:true,format:'esm',platform:'node',outfile:'.sites-runtime/test-api.mjs',plugins:[{name:'cloudflare-test-binding',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'environment',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const env = globalThis.__testEnv;',loader:'js'}));}}]});
const sqlite=new DatabaseSync(':memory:');
sqlite.exec('PRAGMA foreign_keys=ON');
for(const name of readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort())sqlite.exec(readFileSync('drizzle/'+name,'utf8'));
// Upgrade existing rooms without resetting their shared reading position or ballots.
const legacy=new DatabaseSync(':memory:');
for(const name of readdirSync('drizzle').filter(n=>n.endsWith('.sql')&&n<'0003').sort())legacy.exec(readFileSync('drizzle/'+name,'utf8'));
legacy.exec("INSERT INTO rooms(code,owner,host_hash,title,status,step,phase,created_at) VALUES('ABC234','owner','hash','existing','playing',5,'open',1); INSERT INTO players(id,room,name,token_hash,last_seen,created_at) VALUES('reader','ABC234','existing reader','hash',1,1); INSERT INTO ballots(room,poll,player,choice,updated_at) VALUES('ABC234','identity','reader','C',1)");
legacy.exec(readFileSync('drizzle/0003_reading_progress.sql','utf8'));
assert.deepEqual(legacy.prepare('SELECT step FROM room_reading_progress ORDER BY reader').all().map(row=>row.step),[5,5]);
legacy.exec(readFileSync('drizzle/0004_discussion_answers.sql','utf8'));
assert.equal(legacy.prepare('SELECT revealed_answers FROM rooms').get().revealed_answers,'[]');
assert.deepEqual(legacy.prepare('SELECT step FROM room_reading_progress ORDER BY reader').all().map(row=>row.step),[5,5]);
assert.equal(legacy.prepare('SELECT count(*) AS n FROM ballots').get().n,1);
const upgrades=[
 {code:'LOBBY2',status:'lobby',step:0,reader:0,answers:[],act:1},
 {code:'ACTEND',status:'playing',step:5,reader:6,answers:['scene-7'],act:1},
 {code:'READ22',status:'playing',step:5,reader:7,answers:[],act:2},
 {code:'VOTE22',status:'playing',step:8,reader:0,answers:[],act:2},
 {code:'READ33',status:'playing',step:8,reader:10,answers:[],act:3},
 {code:'VOTE33',status:'playing',step:12,reader:0,answers:[],act:3},
 {code:'ANSW22',status:'playing',step:5,reader:0,answers:['scene-10'],act:2},
 {code:'ANSW33',status:'playing',step:8,reader:0,answers:['scene-14'],act:3},
 {code:'FINISH',status:'finished',step:0,reader:0,answers:[],act:3}
];
for(const item of upgrades){
 legacy.prepare("INSERT INTO rooms(code,owner,host_hash,title,status,step,phase,created_at,revealed_answers) VALUES(?,'owner','hash','legacy',?,?,'closed',1,?)").run(item.code,item.status,item.step,JSON.stringify(item.answers));
 legacy.prepare("INSERT INTO room_reading_progress(room,reader,step) VALUES(?,'host',?)").run(item.code,item.reader);
}
legacy.exec(readFileSync('drizzle/0005_act_unlocks.sql','utf8'));
for(const item of upgrades){
 const row=legacy.prepare('SELECT * FROM rooms WHERE code=?').get(item.code);
 assert.equal(row.unlocked_act,item.act,item.code);assert.equal(row.version,1);
 assert.equal(row.step,item.step);assert.equal(row.revealed_answers,JSON.stringify(item.answers));
 assert.equal(legacy.prepare('SELECT step FROM room_reading_progress WHERE room=?').get(item.code).step,item.reader);
}
assert.equal(legacy.prepare("SELECT unlocked_act FROM rooms WHERE code='ABC234'").get().unlocked_act,1);
assert.equal(legacy.prepare('SELECT count(*) AS n FROM ballots').get().n,1);legacy.close();
const fresh=new DatabaseSync(':memory:');fresh.exec(readFileSync('deployment/initialize.sql','utf8'));
assert.equal(fresh.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table'").get().n,8);
fresh.exec("INSERT INTO rooms(code,owner,host_hash,title,created_at) VALUES('NEW234','owner','hash','fresh',1)");
assert.equal(fresh.prepare('SELECT unlocked_act FROM rooms').get().unlocked_act,1);fresh.close();
class Prepared{constructor(sql,args=[]){this.sql=sql;this.args=args;}bind(...args){return new Prepared(this.sql,args);}async first(){return sqlite.prepare(this.sql).get(...this.args)||null;}async all(){return {results:sqlite.prepare(this.sql).all(...this.args)};}async run(){const r=sqlite.prepare(this.sql).run(...this.args);return {success:true,meta:{changes:Number(r.changes)}};}}
const objects=new Map();
globalThis.__testEnv={AUTH_MODE:'sites',DB:{prepare(sql){return new Prepared(sql);},async batch(statements){return Promise.all(statements.map(statement=>statement.all()));}},BUCKET:{async put(key,bytes,options){objects.set(key,{bytes,options});},async delete(key){objects.delete(key);},async get(key){const o=objects.get(key);return o?{body:o.bytes,writeHttpMetadata(h){h.set('Content-Type',o.options.httpMetadata.contentType);}}:null;}}};
const {roomApi,charactersApi,imageApi,hostApi,progress}=await import('../.sites-runtime/test-api.mjs');
async function post(body,token='',owner=''){return roomApi.POST(new Request('https://example.test/api/room',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(owner?{'oai-authenticated-user-id':owner}:{})},body:JSON.stringify(body)}));}
async function call(body,token='',owner=''){const r=await post(body,token,owner),d=await r.json();assert.equal(r.status,200,JSON.stringify(d));return d;}
async function state(s){const r=await roomApi.GET(new Request('https://example.test/api/room?code='+s.code,{headers:{Authorization:'Bearer '+s.token}}));assert.equal(r.status,200);return r.json();}
assert.equal((await post({action:'create'})).status,401);
const host=await call({action:'create',title:'测试房间'},'','owner-A');
const a=await call({action:'join',code:host.code,name:'参与者甲'}),b=await call({action:'join',code:host.code,name:'参与者乙'});
const hostB=await call({action:'create',title:'另一房间'},'','owner-B');
const expectedAnswers=JSON.parse(readFileSync('content/answers.json','utf8'));
const revealedAnswers={};
const reveal=(s,version,scene='scene-7')=>({action:'reveal-answer',code:s.code,scene,version});
assert.deepEqual((await state(host)).answers,{});assert.deepEqual((await state(a)).answers,{});
assert.equal((await post(reveal(host,0),a.token)).status,403);
assert.equal((await post(reveal(host,0),host.token)).status,409);
assert.equal((await post(reveal(host,0,'scene-1'),host.token)).status,400);
assert.equal((await post(reveal(hostB,0),host.token)).status,401);
assert.equal((await post({action:'control',code:host.code,command:'start',version:0},a.token)).status,403);
assert.equal((await post({action:'vote',code:host.code,poll:'identity',choice:'C'},a.token)).status,409);
let current=await state(host);assert.equal(current.players.length,2);assert(!('host_hash' in current.room));assert(!('owner' in current.room));
assert.equal(current.room.unlockedAct,1);assert.equal(current.waitingAct,null);
assert.equal((await post({action:'control',code:host.code,command:'unlock-act',version:current.room.version},host.token)).status,409);
async function control(command){current=await call({action:'control',code:host.code,command,version:current.room.version},host.token);return current;}

const story=JSON.parse(readFileSync('content/story.json','utf8'));
const pollScenes=story.scenes.flatMap((scene,step)=>scene.type==='poll'?[{...scene,step}]:[]);
async function read(s,direction='next',version){const before=await state(s);return call({action:'read',code:s.code,direction,version:version??before.reading.version},s.token);}
async function reach(s,step){let snapshot=await state(s);while(snapshot.reading.step<step)snapshot=await read(s);return snapshot;}
const vote=(s,poll,choice,reason='')=>call({action:'vote',code:s.code,poll,choice,reason},s.token);
assert.equal((await post({action:'read',code:a.code,direction:'next',version:0},a.token)).status,409);
await control('start');
assert.equal((await post({action:'control',code:host.code,command:'unlock-act',version:current.room.version},host.token)).status,409);
assert.equal((await post(reveal(host,current.room.version),host.token)).status,409);
assert.equal(current.room.step,3);assert.equal(current.waitingPoll,'identity');
assert.equal(current.arrived,0);assert.equal(current.reading.step,0);
const advanced={...current,reading:{...current.reading,step:2,version:2}};
assert.equal(progress.newerState(advanced,current).reading.step,2);
const rewound={...current,reading:{...current.reading,step:1,version:3}};
assert.equal(progress.newerState(advanced,rewound).reading.step,1);
const laterRound={...current,room:{...current.room,version:current.room.version+1},reading:{...current.reading,limit:5}};
assert.equal(progress.newerState(rewound,laterRound).reading.step,1);
assert.equal(progress.newerState(rewound,laterRound).reading.limit,5);
assert.equal((await post({action:'control',code:host.code,command:'next',version:current.room.version},host.token)).status,409);
assert.equal((await post({action:'control',code:host.code,command:'open',version:0},host.token)).status,409);
assert.equal((await post({action:'control',code:host.code,command:'finish',version:current.room.version},host.token)).status,409);
assert.equal((await post({action:'read',code:hostB.code,direction:'next',version:0},a.token)).status,401);
assert.equal((await post({action:'read',code:a.code,direction:'skip',version:0},a.token)).status,400);
await read(a);
assert.equal((await state(a)).reading.step,1);assert.equal((await state(b)).reading.step,0);
const revision=(await state(a)).reading.version;
const raced=await Promise.all(Array.from({length:2},()=>post({action:'read',code:a.code,direction:'next',version:revision},a.token)));
assert.deepEqual(raced.map(r=>r.status).sort(),[200,409]);assert.equal((await state(a)).reading.step,2);
await reach(a,3);assert.equal((await state(host)).arrived,1);
assert.equal((await state(a)).reading.step,3); // Reload recovers the cursor.
assert.equal((await state(host)).arrived,1); // Repeated reads do not duplicate arrival.
await read(a,'previous');assert.equal((await state(host)).arrived,0);
await read(a);await reach(host,3);assert.equal((await state(host)).arrived,1); // Host is excluded.
assert.equal((await post({action:'read',code:a.code,direction:'next',version:(await state(a)).reading.version},a.token)).status,409);
await control('open');assert.equal((await state(b)).reading.step,0); // Opening never jumps a slower reader.
assert.equal((await post({action:'control',code:host.code,command:'unlock-act',version:current.room.version},host.token)).status,409);
assert.equal((await post({action:'vote',code:b.code,poll:'identity',choice:'C'},b.token)).status,409);
await reach(b,3);assert.equal((await state(host)).arrived,2);
await Promise.all([vote(a,'identity','C','反复回避承诺'),vote(b,'identity','H','我有不同理解')]);
await vote(a,'identity','H','修改理由');
let before=await state(host);assert.equal(before.submitted,2);assert.equal(before.results.identity,undefined);assert.equal((await state(a)).myVote.choice,'H');
assert.equal((await post({action:'read',code:a.code,direction:'next',version:(await state(a)).reading.version},a.token)).status,409);
await vote(a,'identity','C','原有支持者的利益');await control('close');
assert.deepEqual(current.results.identity.counts,{C:1,H:1});assert.equal(current.results.identity.winners.length,2);
assert.equal(current.waitingPoll,'cooperation');assert.equal(current.arrived,0);assert.equal(current.submitted,0);
assert.equal((await post({action:'vote',code:a.code,poll:'identity',choice:'H'},a.token)).status,409);
assert.equal((await state(a)).myVote.choice,'C');
assert.equal((await post({action:'vote',code:hostB.code,poll:'identity',choice:'C'},a.token)).status,401);
assert.equal((await post({action:'export',code:host.code},b.token)).status,403);
const exported=await call({action:'export',code:host.code},host.token);assert.equal(exported.results.identity.total,2);
const assignment=await read(a);assert.equal(assignment.reading.step,4);
assert(story.scenes[4].task.intro);assert(story.scenes[4].task.objectives.length>0);
assert.equal((await state(b)).reading.step,3); // Reading the role assignment is independent.
for(const scene of pollScenes.slice(1)){
 if(scene.act>1){
  current=await state(host);
  const boundary=story.scenes.findIndex(item=>item.act===scene.act)-1;
  assert.equal(current.waitingAct,scene.act);assert.equal(current.waitingPoll,null);
  assert.equal(current.reading.limit,boundary);
  const blocked=await reach(a,boundary),slowBefore=await state(b),hostBefore=current;
  assert.equal((await post({action:'read',code:a.code,direction:'next',version:blocked.reading.version},a.token)).status,409);
  assert.equal((await post({action:'control',code:host.code,command:'open',version:current.room.version},host.token)).status,409);
  assert.equal((await post({action:'control',code:host.code,command:'finish',version:current.room.version},host.token)).status,409);
  assert.equal((await post({action:'vote',code:a.code,poll:scene.poll,choice:'A'},a.token)).status,409);
  assert.equal((await post(reveal(host,current.room.version,scene.act===2?'scene-10':'scene-14'),host.token)).status,409);
  const unlock={action:'control',code:host.code,command:'unlock-act',version:current.room.version};
  assert.equal((await post(unlock,a.token)).status,403);
  assert.equal((await post({...unlock,code:hostB.code},host.token)).status,401);
  assert.equal((await post({...unlock,version:current.room.version-1},host.token)).status,409);
  const unlocks=await Promise.all([post(unlock,host.token),post(unlock,host.token)]);
  assert.deepEqual(unlocks.map(r=>r.status).sort(),[200,409]);
  current=await state(host);assert.equal(current.room.unlockedAct,scene.act);
  assert.equal(current.waitingAct,null);assert.equal(current.waitingPoll,scene.poll);
  assert.equal(current.room.phase,'closed');assert.equal(current.room.step,hostBefore.room.step);
  assert.equal(current.reading.step,hostBefore.reading.step);assert.equal(current.reading.version,hostBefore.reading.version);
  assert.equal(current.reading.limit,scene.step);
  const unlocked=await state(a),slowAfter=await state(b);
  assert.equal(unlocked.reading.step,boundary);assert.equal(unlocked.reading.version,blocked.reading.version);
  assert.equal(slowAfter.reading.step,slowBefore.reading.step);assert.equal(slowAfter.reading.version,slowBefore.reading.version);
  assert.equal(progress.newerState(unlocked,blocked).room.unlockedAct,scene.act);
  assert.equal((await post(unlock,host.token)).status,409);
  assert.equal((await post({...unlock,version:current.room.version},host.token)).status,409);
  await read(a,'previous');await read(a); // Backtracking and reload preserve the unlocked act.
  assert.equal((await state(a)).room.unlockedAct,scene.act);
 }
 await Promise.all([reach(a,scene.step),reach(b,scene.step)]);
 current=await state(host);assert.equal(current.arrived,2);assert.equal(current.waitingPoll,scene.poll);
 await control('open');const id=scene.poll;
 if(id!=='aid')await Promise.all([vote(a,id,'A','理由甲'),vote(b,id,'A','理由乙')]);
 await control('close');assert.equal(current.results[id].total,id==='aid'?0:2);
 if(id!=='aid')assert.deepEqual(current.results[id].winners,['A']);
 const history=story.scenes.find(item=>item.type==='history'&&item.poll===id);
 if(history&&expectedAnswers[history.id]){
  const answerId=history.id;
  const hidden=await state(a),hostBefore=await state(host),otherBefore=await state(b);
  assert.deepEqual(hidden.answers,revealedAnswers);
  assert(!JSON.stringify(hidden).includes(expectedAnswers[answerId]));
  assert.equal((await post(reveal(host,current.room.version,answerId),a.token)).status,403);
  assert.equal((await post(reveal(host,current.room.version-1,answerId),host.token)).status,409);
  const revealVersion=current.room.version;
  current=await call(reveal(host,revealVersion,answerId),host.token);
  revealedAnswers[answerId]=expectedAnswers[answerId];
  assert.deepEqual(current.answers,revealedAnswers);
  assert.deepEqual(current.reading,hostBefore.reading);
  const shown=await state(a);
  assert.deepEqual(shown.answers,revealedAnswers);assert.deepEqual(shown.reading,hidden.reading);
  assert.deepEqual((await state(b)).answers,revealedAnswers);assert.deepEqual((await state(b)).reading,otherBefore.reading);
  assert.deepEqual((await state(hostB)).answers,{});
  assert.deepEqual(progress.newerState(shown,hidden).answers,revealedAnswers);
  const retried=await call(reveal(host,revealVersion,answerId),host.token);
  assert.equal(retried.room.version,current.room.version);
  const revisited=await read(a,'previous');assert.deepEqual(revisited.answers,revealedAnswers);
  if(id==='cooperation'){
   assert.equal((await post(reveal(host,current.room.version,'scene-10'),host.token)).status,409);
   assert.equal((await state(a)).answers['scene-10'],undefined);
  }
 }
}
assert.equal(Object.keys(current.results).length,4);assert.equal(current.waitingPoll,null);
await control('finish');assert.equal(current.room.status,'finished');
assert.deepEqual(current.answers,expectedAnswers);
assert.equal((await reach(a,14)).reading.step,14); // Finishing does not cut off the closing text.
assert.equal((await post({action:'join',code:host.code,name:'迟到者'})).status,400);
console.log('PASS: independent forward/back reading, persistent cursors, arrival counts, host exclusion, navigation races, voting barriers, role handoff, four rounds and final reading.');
console.log('PASS: answer migration preserves rooms/ballots; answers hidden until authorized host reveal; room isolation, stale-response protection, retry, reload and backtracking persistence; reading progress unchanged.');
console.log('PASS: act 2/3 host gates; premature navigation, voting and reveals rejected; unlock permissions, concurrency, persistence and independent cursors; migration preserves ongoing/finished rooms.');
// Verify image content validation, persistence, shared room visibility and ownership.
function ownerRequest(url,init={},owner='owner-A'){return new Request(url,{...init,headers:{'oai-authenticated-user-id':owner,...init.headers}});}
const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII=','base64'));
async function upload(file){const form=new FormData();form.set('character','borodin');form.set('file',file);return charactersApi.POST(ownerRequest('https://example.test/api/characters',{method:'POST',body:form}));}
assert.equal((await upload(new File(['<svg></svg>'],'bad.svg',{type:'image/svg+xml'}))).status,400);
const up=await upload(new File([png],'portrait.png',{type:'image/png'}));assert.equal(up.status,200);const urls=await up.json();
assert.equal((await state(a)).portraits.borodin,urls.borodin);assert.equal((await state(b)).portraits.borodin,urls.borodin);assert.equal((await state(hostB)).portraits.borodin,undefined);
const key=urls.borodin.split('/').at(-1);const image=await imageApi.GET(new Request('https://example.test'+urls.borodin),{params:Promise.resolve({key})});assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/png');assert.deepEqual(new Uint8Array(await image.arrayBuffer()),png);
await charactersApi.DELETE(ownerRequest('https://example.test/api/characters?character=borodin',{method:'DELETE'},'owner-B'));assert(objects.has(key));
await charactersApi.DELETE(ownerRequest('https://example.test/api/characters?character=borodin',{method:'DELETE'}));assert(!objects.has(key));assert.equal((await state(a)).portraits.borodin,undefined);
console.log('PASS: 2 independent players, concurrent votes, vote replacement, hidden live totals, ties, majority branch, empty round, closed-vote rejection, stale host controls, identity recovery, cross-room protection, full 15-scene / 4-poll lifecycle, export authorization, image validation, shared images and owner isolation.');
// Independent Cloudflare authentication must ignore client-supplied Sites headers.
globalThis.__testEnv.AUTH_MODE='password';
const password=crypto.randomUUID()+crypto.randomUUID();
function login(value,extraHeaders={}){return hostApi.POST(new Request('https://example.test/api/host/session',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://example.test','CF-Connecting-IP':'192.0.2.10',...extraHeaders},body:JSON.stringify({password:value})}));}
assert.equal((await post({action:'create'},'','spoofed-owner')).status,401);
assert.equal((await charactersApi.GET(ownerRequest('https://example.test/api/characters'))).status,401);
assert.equal((await login(password)).status,503);
globalThis.__testEnv.HOST_PASSWORD=password;
assert.equal((await login(password,{Origin:'https://evil.test'})).status,403);
assert.equal((await login(password,{Origin:''})).status,403);
assert.equal((await login('wrong')).status,401);
async function validLogin(){const response=await login(password);assert.equal(response.status,200);const header=response.headers.get('set-cookie');assert.match(header,/HttpOnly/);assert.match(header,/Secure/);assert.match(header,/SameSite=Lax/);return header.split(';')[0];}
const cookie=await validLogin();
async function createWithCookie(value){return roomApi.POST(new Request('https://example.test/api/room',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://example.test',Cookie:value,'oai-authenticated-user-id':'spoofed-owner'},body:JSON.stringify({action:'create',title:'密码主持人'})}));}
const signedCreate=await createWithCookie(cookie);assert.equal(signedCreate.status,200);const signedHost=await signedCreate.json();
assert.equal(sqlite.prepare('SELECT owner FROM rooms WHERE code=?').get(signedHost.code).owner,'standalone-host');
const token=cookie.split('=')[1];
assert.equal(sqlite.prepare('SELECT count(*) AS n FROM host_sessions WHERE token_hash=?').get(token).n,0);
assert.equal((await createWithCookie(cookie.slice(0,-1)+(cookie.endsWith('a')?'b':'a'))).status,401);
globalThis.__testEnv.HOST_PASSWORD=password+'-rotated';
assert.equal((await createWithCookie(cookie)).status,401);
globalThis.__testEnv.HOST_PASSWORD=password;
const logout=await hostApi.DELETE(new Request('https://example.test/api/host/session',{method:'DELETE',headers:{Origin:'https://example.test',Cookie:cookie}}));
assert.equal(logout.status,200);assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);assert.equal((await createWithCookie(cookie)).status,401);
const expiredCookie=await validLogin();sqlite.prepare('UPDATE host_sessions SET expires_at=?').run(Date.now()-1);
assert.equal((await createWithCookie(expiredCookie)).status,401);
for(let attempt=0;attempt<10;attempt++)assert.equal((await login('wrong',{'CF-Connecting-IP':'192.0.2.11'})).status,401);
assert.equal((await login(password,{'CF-Connecting-IP':'192.0.2.11'})).status,429);
console.log('PASS: password login, spoofed-header rejection, origin checks, session expiry, password rotation, logout and persistent login rate limiting.');
sqlite.close();

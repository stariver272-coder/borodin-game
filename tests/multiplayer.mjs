import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {build}=require(require.resolve('esbuild',{paths:[require.resolve('vite')]}));
mkdirSync('.sites-runtime',{recursive:true});
await build({entryPoints:['tests/http-entry.ts'],bundle:true,format:'esm',platform:'node',outfile:'.sites-runtime/test-api.mjs',plugins:[{name:'cloudflare-test-binding',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'environment',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const env = globalThis.__testEnv;',loader:'js'}));}}]});
const sqlite=new DatabaseSync(':memory:');
sqlite.exec('PRAGMA foreign_keys=ON');
for(const name of readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort())sqlite.exec(readFileSync('drizzle/'+name,'utf8'));
class Prepared{constructor(sql,args=[]){this.sql=sql;this.args=args;}bind(...args){return new Prepared(this.sql,args);}async first(){return sqlite.prepare(this.sql).get(...this.args)||null;}async all(){return {results:sqlite.prepare(this.sql).all(...this.args)};}async run(){const r=sqlite.prepare(this.sql).run(...this.args);return {success:true,meta:{changes:Number(r.changes)}};}}
const objects=new Map();
globalThis.__testEnv={AUTH_MODE:'sites',DB:{prepare(sql){return new Prepared(sql);}},BUCKET:{async put(key,bytes,options){objects.set(key,{bytes,options});},async delete(key){objects.delete(key);},async get(key){const o=objects.get(key);return o?{body:o.bytes,writeHttpMetadata(h){h.set('Content-Type',o.options.httpMetadata.contentType);}}:null;}}};
const {roomApi,charactersApi,imageApi,hostApi}=await import('../.sites-runtime/test-api.mjs');
async function post(body,token='',owner=''){return roomApi.POST(new Request('https://example.test/api/room',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(owner?{'oai-authenticated-user-id':owner}:{})},body:JSON.stringify(body)}));}
async function call(body,token='',owner=''){const r=await post(body,token,owner),d=await r.json();assert.equal(r.status,200,JSON.stringify(d));return d;}
async function state(s){const r=await roomApi.GET(new Request('https://example.test/api/room?code='+s.code,{headers:{Authorization:'Bearer '+s.token}}));assert.equal(r.status,200);return r.json();}
assert.equal((await post({action:'create'})).status,401);
const host=await call({action:'create',title:'测试房间'},'','owner-A');
const a=await call({action:'join',code:host.code,name:'参与者甲'}),b=await call({action:'join',code:host.code,name:'参与者乙'});
const hostB=await call({action:'create',title:'另一房间'},'','owner-B');
assert.equal((await post({action:'control',code:host.code,command:'start',version:0},a.token)).status,403);
assert.equal((await post({action:'vote',code:host.code,poll:'identity',choice:'C'},a.token)).status,409);
let current=await state(host);assert.equal(current.players.length,2);assert(!('host_hash' in current.room));assert(!('owner' in current.room));
async function control(command){current=await call({action:'control',code:host.code,command,version:current.room.version},host.token);return current;}
await control('start');
assert.equal((await post({action:'control',code:host.code,command:'next',version:0},host.token)).status,409);
for(let i=0;i<3;i++)await control('next');await control('open');
const vote=(s,poll,choice,reason='')=>call({action:'vote',code:s.code,poll,choice,reason},s.token);
await Promise.all([vote(a,'identity','C','反复回避承诺'),vote(b,'identity','H','我有不同理解')]);
await vote(a,'identity','H','修改理由');
let before=await state(host);assert.equal(before.submitted,2);assert.equal(before.results.identity,undefined);assert.equal((await state(a)).myVote.choice,'H');
await vote(a,'identity','C','原有支持者的利益');await control('close');
assert.deepEqual(current.results.identity.counts,{C:1,H:1});assert.equal(current.results.identity.winners.length,2);
assert.equal((await post({action:'vote',code:a.code,poll:'identity',choice:'H'},a.token)).status,409);
assert.equal((await state(a)).myVote.choice,'C');
assert.equal((await post({action:'vote',code:hostB.code,poll:'identity',choice:'C'},a.token)).status,401);
assert.equal((await post({action:'export',code:host.code},b.token)).status,403);
const exported=await call({action:'export',code:host.code},host.token);assert.equal(exported.results.identity.total,2);
for(;;){if(current.room.step===14)break;await control('next');const step=current.room.step;if([5,8,12].includes(step)){await control('open');const id=step===5?'cooperation':step===8?'aid':'land';if(id!=='aid')await Promise.all([vote(a,id,'A','理由甲'),vote(b,id,'A','理由乙')]);await control('close');assert.equal(current.results[id].total,id==='aid'?0:2);if(id!=='aid')assert.deepEqual(current.results[id].winners,['A']);}}
assert.equal(Object.keys(current.results).length,4);await control('finish');assert.equal(current.room.status,'finished');assert.equal((await post({action:'join',code:host.code,name:'迟到者'})).status,400);
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

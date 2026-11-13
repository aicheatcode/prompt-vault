import assert from 'node:assert/strict';
import handler from '../netlify/functions/updates.mjs';
const originalFetch=globalThis.fetch;
const source={ok:true,updatedAt:'2026-11-12',newPrompts:[
{id:'N-demo1',status:'published',prompt:'Complete useful prompt',title:'Demo',category:'Education'},
{id:'N-draft',status:'draft',prompt:'Private content',title:'Secret'}],
overrides:[{id:'P-demo3',status:'published',title:'Revised',prompt:'Public update'}],
hidden:['P-hid'],links:[
{promptId:'N-demo1',title:'Video',url:'https://example.com/watch',type:'video'},
{promptId:'N-draft',title:'DRAFT LEAK',url:'https://example.com/secret'},
{promptId:'P-hid',title:'HIDDEN LEAK',url:'https://example.com/hidden'},
{promptId:'P-demo3',title:'Public',url:'https://example.com/public'}],
site:{eyebrow:'Practical AI education',line1:'AICHEATCODE.',line2:'Ready to use.',description:'Find practical learning resources here.',primaryLabel:'Explore prompts',secondaryLabel:'Download guides',guideHeading:'Helpful resources available',footerLine:'Learn and use AI responsibly.',seoDescription:'Educational prompts and digital skills.'}};
function request(method='GET'){return new Request('https://www.cannybrainy.com/api/updates',{method});}
let count=0;
async function test(name,fn){await fn();console.log('PASS',name);count++;}
await test('405 non-GET',async()=>{let r=await handler(request('POST'));assert.equal(r.status,405)});
await test('validates backend URL host before fetch',async()=>{process.env.GAS_WEB_APP_URL='https://evil.example/exec';let r=await handler(request());assert.equal(r.status,500);delete process.env.GAS_WEB_APP_URL});
await test('read-only URL has feed=public query',async()=>{globalThis.fetch=async(url)=>{assert.equal(new URL(url).searchParams.get('feed'),'public');return new Response(JSON.stringify(source),{headers:{'content-type':'application/json'}})};let r=await handler(request());assert.equal(r.status,200);});
await test('only published prompt records reach client',async()=>{let r=await handler(request());let d=await r.json();assert.equal(d.newPrompts.length,1);assert.equal(d.overrides.length,1);assert.equal(JSON.stringify(d).includes('Private content'),false)});
await test('hidden and orphan draft links removed',async()=>{let r=await handler(request());let d=await r.json();assert.equal(d.links.length,2);assert.equal(JSON.stringify(d).includes('DRAFT LEAK'),false);assert.equal(JSON.stringify(d).includes('HIDDEN LEAK'),false)});
await test('approved homepage content passed through read-only API',async()=>{let r=await handler(request());let d=await r.json();assert.equal(d.site.line2,source.site.line2)});
await test('invalid homepage object removed from public response',async()=>{const original=source.site;source.site={line1:'incomplete'};let r=await handler(request());let d=await r.json();assert.equal(d.site,null);source.site=original;});
await test('oversized backend body rejected',async()=>{globalThis.fetch=async()=>new Response(JSON.stringify(source),{headers:{'content-type':'application/json','content-length':'5000001'}});let r=await handler(request());assert.equal(r.status,502);assert.equal((await r.json()).error,'BACKEND_RESPONSE_TOO_LARGE');globalThis.fetch=async()=>new Response(JSON.stringify(source),{headers:{'content-type':'application/json'}})});
await test('valid JSON content type',async()=>{let r=await handler(request());assert.match(r.headers.get('content-type'),/application\/json/)});
await test('upstream HTML/login rejected',async()=>{globalThis.fetch=async()=>new Response('<html>Login required</html>',{headers:{'content-type':'text/html'}});let r=await handler(request());assert.equal(r.status,502);assert.equal((await r.json()).error,'BACKEND_NOT_JSON')});
await test('schema mismatch rejected',async()=>{globalThis.fetch=async()=>new Response(JSON.stringify({ok:true}),{headers:{'content-type':'application/json'}});let r=await handler(request());assert.equal(r.status,502);assert.equal((await r.json()).error,'BACKEND_SCHEMA_MISMATCH')});
await test('upstream exception returns 502',async()=>{globalThis.fetch=async()=>{throw Error('network down')};let r=await handler(request());assert.equal(r.status,502)});
await test('upstream HTTP failure returns 502',async()=>{globalThis.fetch=async()=>new Response('Failed',{status:401,headers:{'content-type':'text/plain'}});let r=await handler(request());assert.equal(r.status,502)});
globalThis.fetch=originalFetch;
console.log('SUMMARY',count,'PASS');

import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {gunzipSync,gzipSync} from 'node:zlib';
import vm from 'node:vm';
import handler from '../netlify/functions/updates.mjs';
import parts from '../netlify/data/catalog.mjs';

const rows=Object.values(parts).flatMap(x=>JSON.parse(gunzipSync(Buffer.from(x,'base64'))));
const original=rows[0],second=rows[1];
let count=0;
function check(label,fn){fn();count++;console.log('PASS',label);}
const feed={ok:true,updatedAt:'2026-11-13T00:00:00Z',newPrompts:[
 {id:'N-PUBLIC-TEST',status:'published',title:'Published integration test',prompt:'Public content for the integration test.',category:'Education'},
 {id:'N-PRIVATE-TEST',status:'draft',title:'Private test title',prompt:'DRAFT_SECRET_SENTINEL'}],
 overrides:[{id:second.id,status:'published',title:'Edited content',prompt:'REPLACEMENT_PUBLIC_SENTINEL'}],hidden:[original.id],links:[]};
const previous=globalThis.fetch;
globalThis.fetch=async()=>new Response(JSON.stringify(feed),{headers:{'Content-Type':'application/json'}});
try{
 const response=await handler(new Request('https://site.test/api/updates'));
 const data=await response.json();
 const catalog=JSON.parse(gunzipSync(Buffer.from(data.catalogData,'base64')));
 check('withdrawn source absent from served catalogue',()=>assert(!catalog.some(p=>p.id===original.id)));
 check('published override replaces original prompt',()=>assert.equal(catalog.find(p=>p.id===second.id).prompt,'REPLACEMENT_PUBLIC_SENTINEL'));
 check('draft never enters served catalogue',()=>assert(!JSON.stringify(catalog).includes('DRAFT_SECRET_SENTINEL')));
 check('catalogue count matches decoded content',()=>assert.equal(data.catalogCount,catalog.length));
 check('response remains below 6 MiB',()=>assert(Buffer.byteLength(JSON.stringify(data))<6*1024*1024));
 globalThis.fetch=async()=>{throw Error('Offline');};
 const unavailable=await handler(new Request('https://site.test/api/updates'));
 const failure=await unavailable.json();
 check('failed upstream has no catalogue fallback',()=>assert.equal(failure.catalogData,undefined));
 check('failed upstream is not cached',()=>assert.equal(unavailable.headers.get('cache-control'),'no-store'));
}finally{globalThis.fetch=previous;}

const source=readFileSync(new URL('../src/Code.gs',import.meta.url),'utf8');
const helpers=[...source.matchAll(/function\s+(_\w+)\s*\(/g)].map(m=>m[1]);
check('all internal functions are private Apps Script RPCs',()=>assert(helpers.length>20&&helpers.every(x=>x.endsWith('_'))));
const exposed=[...source.matchAll(/function\s+(\w+)\s*\(/g)].map(m=>m[1]).filter(x=>!x.endsWith('_'));
check('only intended server entry points are exposed',()=>assert(exposed.every(x=>x==='doGet'||/^api(?:Public|Admin|RequestCode|VerifyCode|Logout)/.test(x))));
const cache={get(){return null;}};
const runtime=vm.createContext({CacheService:{getScriptCache(){return cache;}}});
vm.runInContext(source,runtime);
for(const name of ['apiAdminBootstrap','apiAdminSearch','apiAdminGet','apiAdminSave','apiAdminArchive','apiAdminHealth','apiAdminGetHome','apiAdminSaveHome']){
 check(name+' rejects unauthenticated calls before data access',()=>assert.throws(()=>runtime[name](),/Session expired/));
}

const snapshotContext=vm.createContext({
 apiPublicChanges:()=>structuredClone(feed),
 Utilities:{base64Decode:s=>Buffer.from(s,'base64'),newBlob:v=>v,
  ungzip:b=>({getDataAsString:()=>gunzipSync(b).toString('utf8')}),
  gzip:v=>({getBytes:()=>gzipSync(Buffer.from(v))}),base64Encode:v=>Buffer.from(v).toString('base64')}
});
vm.runInContext(readFileSync(new URL('../src/Catalog.gs',import.meta.url),'utf8'),snapshotContext);
const gasData=snapshotContext.apiPublicCatalog();
const gasRows=JSON.parse(gunzipSync(Buffer.from(gasData.catalogData,'base64')));
check('Apps Script catalogue hides withdrawn record',()=>assert(!gasRows.some(x=>x.id===original.id)));
check('Apps Script catalogue hides draft record',()=>assert(!gasRows.some(x=>x.id==='N-PRIVATE-TEST')));
for(const file of ['../public/index.html','../src/Index.html']){
 const html=readFileSync(new URL(file,import.meta.url),'utf8');
 check(file+' has no embedded prompt archive',()=>assert(!html.includes('catalog-data')&&!html.includes(original.prompt)));
 check(file+' clears results on connection failure',()=>assert(html.includes('base=[];all=[];liveLinks=[];rebuild();')));
}
console.log('SUMMARY',count,'PASS');

import {gunzipSync,gzipSync} from 'node:zlib';
import catalogParts from '../data/catalog.mjs';
/** AICHEATCODE public read-only API proxy. No admin credentials are sent. */
const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbzMLDBhLCwdwoDn-weuxKygHgoXvcoDA_-RWmcRPQQM9Wse0D6CQoHUOxkmFUOfWwc9XQ/exec';
const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'public, max-age=0, s-maxage=60',
  'X-Content-Type-Options': 'nosniff',
};
function errorResponse(status, code) {
  return new Response(JSON.stringify({ok:false,error:code}), {status, headers: {...headers,'Cache-Control':'no-store'}});
}
export default async function handler(request) {
  if (request.method !== 'GET') return errorResponse(405, 'METHOD_NOT_ALLOWED');
  // This URL points to the PUBLIC /exec deployment, never an Admin-only credential.
  const raw=process.env.GAS_WEB_APP_URL || DEFAULT_GAS_URL;
  let url;
  try {url=new URL(raw);} catch {return errorResponse(500,'INVALID_BACKEND_URL');}
  if(url.protocol!=='https:' || url.hostname!=='script.google.com' ||
    !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname))
      return errorResponse(500,'INVALID_BACKEND_URL');
  url.searchParams.set('feed','public');
  let upstream;
  try {
    upstream=await fetch(url.toString(),{
      method:'GET',redirect:'follow',headers:{'Accept':'application/json'},signal:AbortSignal.timeout(10000)
    });
  } catch {return errorResponse(502,'BACKEND_UNREACHABLE');}
  if(!upstream.ok) return errorResponse(502,'BACKEND_HTTP_ERROR');
  const type=upstream.headers.get('content-type')||'';
  if(!type.toLowerCase().includes('json'))return errorResponse(502,'BACKEND_NOT_JSON');
  if(Number(upstream.headers.get('content-length')||0)>5_000_000)return errorResponse(502,'BACKEND_RESPONSE_TOO_LARGE');
  let data;
  try { const rawText=await upstream.text();if(rawText.length>5_000_000)return errorResponse(502,'BACKEND_RESPONSE_TOO_LARGE');data=JSON.parse(rawText); } catch {return errorResponse(502,'BACKEND_BAD_JSON');}
  if(data?.ok!==true || !Array.isArray(data.newPrompts) || !Array.isArray(data.overrides) ||
     !Array.isArray(data.hidden) || !Array.isArray(data.links))
    return errorResponse(502,'BACKEND_SCHEMA_MISMATCH');
  // Defense in depth: never serialize records marked draft / archived.
  // The Apps Script backend already restricts visibility at source.
  const newPrompts=data.newPrompts.filter(p=>p && p.status==='published' && typeof p.id==='string' && typeof p.prompt==='string')
    .map(p=>({id:p.id,prompt:p.prompt,title:String(p.title||''),category:String(p.category||''),subcategory:String(p.subcategory||''),status:'published'}));
  const overrides=data.overrides.filter(p=>p && p.status==='published' && typeof p.id==='string' && typeof p.prompt==='string')
    .map(p=>({id:p.id,prompt:p.prompt,title:String(p.title||''),category:String(p.category||''),subcategory:String(p.subcategory||''),status:'published'}));
  const liveIds=new Set([...newPrompts.map(p=>p.id),...overrides.map(p=>p.id)]);
  const hidden=data.hidden.filter(id=>typeof id==='string');
  const hiddenSet=new Set(hidden);
  const links=data.links.filter(l=>l && typeof l.promptId==='string' && typeof l.url==='string' &&
      l.url.startsWith('https://') && !hiddenSet.has(l.promptId) &&
      (l.promptId.startsWith('P-') || liveIds.has(l.promptId)))
    .map(l=>({id:String(l.id||''),promptId:l.promptId,type:String(l.type||''),title:String(l.title||''),
       url:l.url,description:String(l.description||'')}));
  const siteFields=['eyebrow','line1','line2','description','primaryLabel','secondaryLabel','guideHeading','footerLine','seoDescription'];
  const site=data.site && typeof data.site==='object' && siteFields.every(k=>typeof data.site[k]==='string' && data.site[k].length>=2 && data.site[k].length<=320)
    ? Object.fromEntries(siteFields.map(k=>[k,data.site[k]])) : null;
  const records=new Map();
  for(const value of Object.values(catalogParts)){
    for(const item of JSON.parse(gunzipSync(Buffer.from(value,'base64')).toString('utf8'))){
      if(!hiddenSet.has(item.id))records.set(item.id,item);
    }
  }
  for(const item of [...overrides,...newPrompts]){
    if(!hiddenSet.has(item.id))records.set(item.id,{...(records.get(item.id)||{}),...item,source:'owner'});
  }
  const published=[...records.values()];
  const catalogData=gzipSync(Buffer.from(JSON.stringify(published)),{level:1}).toString('base64');
  return new Response(JSON.stringify({ok:true,updatedAt:String(data.updatedAt||''),newPrompts,overrides,hidden,links,site,catalogData,catalogCount:published.length}),
    {status:200,headers});
}
export const config = {path: '/api/updates'};

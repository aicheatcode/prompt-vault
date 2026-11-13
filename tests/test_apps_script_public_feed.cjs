const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const code=fs.readFileSync(__dirname+'/../src/Code.gs','utf8');
let data={};
const mocks={
 ContentService:{MimeType:{JSON:'application/json'},createTextOutput(s){return {value:s,setMimeType(m){this.mime=m;return this}}}},
 HtmlService:{createHtmlOutputFromFile(name){return {name,setTitle(){return this},addMetaTag(){return this}}}},
 CacheService:{getScriptCache(){return {get(){return null},put(){},remove(){}}}},
 SpreadsheetApp:{openById(){return {getSheetByName(){return null;}}}},
 LockService:{},
 Utilities:{},
 PropertiesService:{},
 console
};
const ctx=vm.createContext(mocks);
vm.runInContext(code,ctx);
// Test the *actual published feed function* with a fake Sheets adapter.
ctx._rows_=(tab)=>data[tab]||[];
ctx._time_=()=>new Date(0).toISOString();
ctx._validUrl_=u=>/^https:\/\/[^\s]+/.test(u);
const newPrompt=['N-LIVE','published prompt','Published title','Pendidikan','Education','published','','','owner'];
const draftPrompt=['N-DRAFT','private prompt','Secret title','Pendidikan','Education','draft','','','owner'];
const link=(id,parent,status)=>[id,parent,'video','Reference title','https://example.org/video','desc','Pendidikan',status,'','owner',1];
let count=0;
function t(name,fn){fn();console.log('PASS',name);count++}
data={Vault_NewPrompts:[newPrompt,draftPrompt],Vault_Overrides:[],Vault_ResourceLinks:[link('R-LIVE','N-LIVE','published'),link('R-DRAFT','N-DRAFT','published')]};
t('Apps Script JSON doGet returns JSON feed',()=>{let r=ctx.doGet({parameter:{feed:'public'}});let out=JSON.parse(r.value);assert.equal(r.mime,'application/json');assert.equal(out.ok,true)});
t('Draft prompt excluded at backend source',()=>{const d=JSON.parse(ctx.doGet({parameter:{feed:'public'}}).value);assert.equal(d.newPrompts.length,1);assert.equal(JSON.stringify(d).includes('private prompt'),false)});
t('Published child link of Draft prompt excluded',()=>{const d=JSON.parse(ctx.doGet({parameter:{feed:'public'}}).value);assert.equal(d.links.length,1);assert.equal(d.links[0].promptId,'N-LIVE')});
t('Archived original prompt override hides old link',()=>{
 data.Vault_Overrides=[['P-OLD','Hidden title','hidden prompt','Pendidikan','Education','archived','','','owner',1]];
 data.Vault_ResourceLinks.push(link('R-OLD','P-OLD','published'));
 const d=JSON.parse(ctx.doGet({parameter:{feed:'public'}}).value);
 assert.equal(d.hidden.includes('P-OLD'),true);assert.equal(d.links.some(x=>x.promptId==='P-OLD'),false);
});
t('Original public/admin HTML doGet routing preserved',()=>{
 assert.equal(ctx.doGet({parameter:{}}).name,'Index');
 assert.equal(ctx.doGet({parameter:{admin:'1'}}).name,'Admin');
});
console.log('SUMMARY',count,'PASS');

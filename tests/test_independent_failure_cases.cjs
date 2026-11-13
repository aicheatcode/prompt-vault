const fs=require('fs'),vm=require('vm');
const code=fs.readFileSync(__dirname+'/../src/Code.gs','utf8');
const sid='P-27e0ca3dd1370cd2dfc0c942';
const newId='N-aaaaaaaaaaaa';
let db={
 Prompt_Master:[[sid,'Prompt source original',...Array(18).fill(''), 'Design an effective AI poster\ue000Pendidikan\ue000Design']],
 Vault_NewPrompts:[[newId,'A published prompt for testing','Original published title','Pendidikan','Practice','published','','2026-11-13','owner@test.com']],
 Vault_Overrides:[],Vault_ResourceLinks:[]
};
let failLink=false, failLinkOnceAt=0, linkWrites=0;
const mockSheet=(name)=>({
 getLastRow(){return (db[name]||[]).length+1},
 getRange(row,col,numRows=1,numCols=1){return {
  getValue(){return ((db[name]||[])[row-2]||[])[col-1]},
  getValues(){return (db[name]||[]).slice(row-2,row-2+numRows).map(r=>r.slice(col-1,col-1+numCols))},
  createTextFinder(query){let idx=0;return {matchCase(){return this},findNext(){for(;idx<(db[name]||[]).length;idx++){if(String(db[name][idx][col-1]||'').toLowerCase().includes(query.toLowerCase()))return {getRow(){return idx+2}};}return null;}}},
  setNumberFormat(){return this},setValues(rows){ if(name==='Vault_ResourceLinks' && failLink)throw Error('INJECTED: link database write failed');for(let i=0;i<rows.length;i++)db[name][row-2+i]=rows[i];return this;}
 }}
});
const ctx=vm.createContext({
 SpreadsheetApp:{openById(){return {getSheetByName:mockSheet}},flush(){}},
 CacheService:{getScriptCache(){return {get(){return null},put(){},remove(){}}}},
 PropertiesService:{getScriptProperties(){return {getProperty(){return null}}}},
 Utilities:{getUuid(){return '00000000-0000-0000-0000-000000000001';}},
 console,ContentService:{},HtmlService:{}
});
vm.runInContext(code,ctx);
ctx._checkSession_=(t)=>{if(t!=='VALID')throw Error('BAD_SESSION');return 'owner@test.com'};
ctx._guard_=fn=>fn();ctx._log_=()=>{};ctx._rows_=(name)=>db[name]||[];
ctx._sheet_=mockSheet;
ctx._find_=(name,id)=>{const i=(db[name]||[]).findIndex(r=>r[0]===id);return i===-1?null:{row:i+2,v:[...db[name][i]]}};
ctx._append_=(name,row)=>{if(name==='Vault_ResourceLinks'&&failLink)throw Error('INJECTED: link database write failed');db[name]||=[];db[name].push([...row]);return db[name].length+1};
ctx._update_=(name,row,arr)=>{if(name==='Vault_ResourceLinks'){linkWrites++;if(failLink || (failLinkOnceAt && linkWrites===failLinkOnceAt)){failLinkOnceAt=0;throw Error('INJECTED: link database write failed')}}db[name][row-2]=[...arr]};
ctx._time_=()=> '2026-11-13T00:00:00Z';
const found=ctx.apiAdminSearch('VALID',sid).items.some(x=>x.id===sid);
console.log('INDEPENDENT CASE A — Admin search of existing Prompt ID:',found?'PASS':'FAIL','(source ID stored in column A; source search checks column U only)');
const before=ctx.apiPublicChanges().newPrompts.some(x=>x.id===newId);
failLink=true;
let failed=false;
try{ctx.apiAdminSave('VALID',{id:newId,title:'Updated published title',prompt:'Act as a professional mentor and provide a carefully reasoned comparison.',category:'Pendidikan',subcategory:'Practice',status:'published',links:[{type:'video',title:'Example',url:'https://example.org/test'}]})}catch(e){failed=true}
const after=ctx.apiPublicChanges().newPrompts.some(x=>x.id===newId);
console.log('INDEPENDENT CASE B — Published record remains available when child-link update fails:',before && after?'PASS':'FAIL',`(before=${before}, after=${after}, returnedError=${failed}, status=${db.Vault_NewPrompts[0][5]})`);

// A different failure mode: first resource edit writes, second fails, compensation restores both.
failLink=false;linkWrites=0;failLinkOnceAt=2;
db.Vault_NewPrompts[0]=[newId,'A published prompt for testing','Original published title','Pendidikan','Practice','published','','2026-11-13','owner@test.com'];
db.Vault_ResourceLinks=[
 ['R-aaaaaaaaaaaa',newId,'video','Old video','https://example.org/a','','Pendidikan','published','2026-11-13','owner@test.com','1'],
 ['R-bbbbbbbbbbbb',newId,'application','Old app','https://example.org/b','','Pendidikan','published','2026-11-13','owner@test.com','2']
];
let partialError=false;
try{ctx.apiAdminSave('VALID',{id:newId,title:'Replacement title',prompt:'Act as a professional mentor and provide a carefully reasoned comparison.',category:'Pendidikan',subcategory:'Practice',status:'published',links:[
 {id:'R-aaaaaaaaaaaa',type:'video',title:'Replacement video',url:'https://example.org/c'},
 {id:'R-bbbbbbbbbbbb',type:'application',title:'Replacement app',url:'https://example.org/d'}
]})}catch(e){partialError=true}
const restored=db.Vault_NewPrompts[0][2]==='Original published title' && db.Vault_NewPrompts[0][5]==='published' && db.Vault_ResourceLinks.every(r=>r[7]==='published') && db.Vault_ResourceLinks[0][3]==='Old video';
console.log('INDEPENDENT CASE C — staged link update failure compensates earlier successful writes:',restored && partialError?'PASS':'FAIL',`(restored=${restored}, error=${partialError})`);

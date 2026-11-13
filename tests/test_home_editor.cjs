const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../src/Code.gs','utf8');
let records={},failLinks=false,log=[],uuid=0;
const sheetData=()=>records;
const mockSheet={
 getLastRow(){return ((records.Vault_SiteContent||[]).length)+1},
 getRange(row,col,r,c){return {
  setValues(rows){records.Vault_SiteContent ||= [];for(let i=0;i<rows.length;i++)records.Vault_SiteContent[row-2+i]=rows[i];return this;},
  setNumberFormat(){return this;},
  getValues(){return (records.Vault_SiteContent||[]).slice(row-2,row-2+r)},
  createTextFinder(value){return {matchEntireCell(){return this},findNext(){const at=(records.Vault_SiteContent||[]).findIndex(x=>x[0]===value);return at<0?null:{getRow(){return at+2}};}}}
 };},setFrozenRows(){},
};
const spreadsheet={getSheetByName(tab){return tab==='Vault_SiteContent'&&records.Vault_SiteContent?mockSheet:null},insertSheet(){records.Vault_SiteContent=[];return mockSheet}};
const context=vm.createContext({
 SpreadsheetApp:{openById(){return spreadsheet},flush(){}},
 CacheService:{getScriptCache(){return {get(){return null},put(){},remove(){}}}},
 PropertiesService:{getScriptProperties(){return {getProperty(){return ''}}}},
 Utilities:{getUuid(){return `00000000-0000-0000-0000-${String(++uuid).padStart(12,'0')}`}},
 ContentService:{MimeType:{JSON:'application/json'},createTextOutput(value){return {value,setMimeType(mime){this.mime=mime;return this}}}},
 HtmlService:{createHtmlOutputFromFile(name){return {name,setTitle(){return this},addMetaTag(){return this}}}},
 console
});
vm.runInContext(source,context);
context._checkSession_=(token)=>{if(token!=='VALID')throw Error('Access denied');return 'owner@example.com';};
context._guard_=fn=>fn();
context._log_=(who,act)=>log.push([who,act]);
context._rows_=name=>records[name]||[];
context._time_=()=>new Date('2026-11-13T00:00:00Z').toISOString();
context._find_=(name,id)=>{const i=(records[name]||[]).findIndex(r=>r[0]===id);return i<0?null:{row:i+2,v:records[name][i]}};
context._sheet_=(name)=>({getLastRow(){return (records[name]||[]).length+1}});
context._append_=(name,row)=>{if(name==='Vault_ResourceLinks'&&failLinks)throw Error('Injected link write failure');records[name]||=[];records[name].push([...row]);return records[name].length+1;};
context._update_=(name,row,values)=>{records[name][row-2]=[...values];};
const checks=[];
function test(label,cb){cb();checks.push(label);console.log('PASS',label)}
const home={eyebrow:'Practical AI learning',line1:'AICHEATCODE.',line2:'Ready to use.',description:'Find useful AI prompts for learning and work.',primaryLabel:'Explore prompts',secondaryLabel:'Download guides',guideHeading:'Resources for your next task',footerLine:'Practical AI education without inflated claims.',seoDescription:'Practical and organized AI prompts for learning and work.'};
let revised={...home,line2:'Learn. Create. Apply.'};
test('owner homepage requires authentication',()=>assert.throws(()=>context.apiAdminGetHome('INVALID')));
test('homepage default available without creating sheet',()=>{let a=context.apiAdminGetHome('VALID');assert.equal(a.published,null);assert.equal(records.Vault_SiteContent,undefined)});
test('invalid homepage content rejected',()=>assert.throws(()=>context.apiAdminSaveHome('VALID',{...home,line1:'<'.repeat(56)},'draft')));
test('draft saved into new CMS tab',()=>{let r=context.apiAdminSaveHome('VALID',home,'draft');assert.equal(r.ok,true);assert.equal(records.Vault_SiteContent.length,1)});
test('draft never included in public response',()=>{let d=context.apiPublicChanges();assert.equal(d.site,null)});
test('owner can retrieve homepage draft',()=>{let a=context.apiAdminGetHome('VALID');assert.equal(a.draft.line1,'AICHEATCODE.')});
test('publish homepage atomic single-row content',()=>{context.apiAdminSaveHome('VALID',home,'publish');let d=context.apiPublicChanges();assert.equal(d.site.guideHeading,home.guideHeading)});
test('save revised draft preserves published homepage',()=>{context.apiAdminSaveHome('VALID',revised,'draft');let d=context.apiPublicChanges();assert.equal(d.site.line2,home.line2)});
test('publish revised homepage and public receives change',()=>{context.apiAdminSaveHome('VALID',revised,'publish');let d=context.apiPublicChanges();assert.equal(d.site.line2,revised.line2)});
test('untrusted HTML content remains string not executable markup',()=>{let data={...home,description:'<img src=x onerror=alert(1)>'};context.apiAdminSaveHome('VALID',data,'publish');assert.equal(context.apiPublicChanges().site.description,data.description)});
test('invalid action cannot write',()=>assert.throws(()=>context.apiAdminSaveHome('VALID',home,'delete')));
test('owner create prompt staged when child link write fails',()=>{records.Vault_NewPrompts=[];records.Vault_Overrides=[];records.Vault_ResourceLinks=[];failLinks=true;
 const d={title:'Quality test task',prompt:'Act as an educator and analyze this task carefully.',category:'Pendidikan',subcategory:'Practice',status:'published',links:[{type:'video',title:'Example video',url:'https://example.com/test',description:'Demo'}]};
 assert.throws(()=>context.apiAdminSave('VALID',d));assert.equal(records.Vault_NewPrompts.length,1);assert.equal(records.Vault_NewPrompts[0][5],'draft');assert.equal(context.apiPublicChanges().newPrompts.length,0);failLinks=false;
});
test('unauthenticated save rejected',()=>assert.throws(()=>context.apiAdminSave('INVALID',{title:'hello'})));
console.log('SUMMARY',checks.length,'PASS');

/** AICHEATCODE | One-deployment Apps Script CMS (V8)
 * Public: deployment URL. Owner: same URL + ?admin=1, OTP authentication.
 * Existing Prompt_Master is never mutated. Owner content and media links reside
 * in Vault_NewPrompts, Vault_Overrides, Vault_ResourceLinks, Vault_Audit.
 * Set ADMIN_EMAIL in Project Settings > Script Properties BEFORE deployment.
 */
const APP = Object.freeze({
  spreadsheetId:'1-qGTtLzXU6AhGKhdd-NOs8vkUVlakjaiQzHEdOaXpfQ',
  master:'Prompt_Master', news:'Vault_NewPrompts', overrides:'Vault_Overrides',
  links:'Vault_ResourceLinks', audit:'Vault_Audit', categories:'Vault_Categories', site:'Vault_SiteContent',
  sessionSeconds:21600, otpSeconds:600, maxNew:20000,maxOverrides:20000,maxLinks:50000
});
const CATEGORY_NAMES=Object.freeze({'AI & Prompt':'AI & Prompt','Pendidikan':'Education','Pemasaran':'Marketing',
'Reka Bentuk':'Design','Imej & Video AI':'AI Image & Video','Teknologi':'Technology',
'Perniagaan':'Business','Kewangan':'Finance','Kerjaya':'Careers','Penulisan':'Writing','Kehidupan':'Everyday Life'});
function doGet(e){
  // Public JSON is READ-ONLY and contains only approved CMS updates.
  // Keep Owner actions behind google.script.run + server-side OTP checks.
  if(String(e&&e.parameter&&e.parameter.feed||'')==='public'){
    return ContentService.createTextOutput(JSON.stringify(apiPublicChanges()))
      .setMimeType(ContentService.MimeType.JSON);
  }
  const isAdmin=String(e&&e.parameter&&e.parameter.admin||'')==='1';
  return HtmlService.createHtmlOutputFromFile(isAdmin?'Admin':'Index')
    .setTitle(isAdmin?'Private Content Manager':'AICHEATCODE — AI Prompts & Free Resources')
    .addMetaTag('viewport','width=device-width, initial-scale=1');
}
function _sheet_(name){const s=SpreadsheetApp.openById(APP.spreadsheetId).getSheetByName(name);if(!s)throw Error('Required data tab is unavailable.');return s;}
function _text_(s,n){return String(s==null?'':s).trim().slice(0,n||30000);}
function _time_(){return new Date().toISOString();}
function _safe_(s){s=String(s==null?'':s);return /^[=+\-@]/.test(s)?"'"+s:s;}
function _hash_(s){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(s))
 .map(b=>('0'+(b&255).toString(16)).slice(-2)).join('');}
function _prop_(name){return PropertiesService.getScriptProperties().getProperty(name)||'';}
function _secret_(){let s=_prop_('SESSION_SECRET');if(!s){s=Utilities.getUuid()+Utilities.getUuid()+Utilities.getUuid();PropertiesService.getScriptProperties().setProperty('SESSION_SECRET',s);}return s;}
function _ownerEmail_(){const email=_prop_('ADMIN_EMAIL').trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Admin email has not been configured.');return email;}
function _append_(name,row){const s=_sheet_(name),r=s.getLastRow()+1;if(row.length>s.getMaxColumns())throw Error('Data tab schema mismatch.');const target=s.getRange(r,1,1,row.length);target.setNumberFormat('@');target.setValues([row.map(_safe_)]);return r;}
function _update_(name,row,arr){const range=_sheet_(name).getRange(row,1,1,arr.length);range.setNumberFormat('@');range.setValues([arr.map(_safe_)]);}
function _find_(name,id){if(!id)return null;const s=_sheet_(name),n=s.getLastRow()-1;if(n<1)return null;
 const cell=s.getRange(2,1,n,1).createTextFinder(id).matchEntireCell(true).findNext();
 return cell?{row:cell.getRow(),v:s.getRange(cell.getRow(),1,1,s.getLastColumn()).getValues()[0]}:null;}
function _rows_(name,max,columns){
 const s=_sheet_(name),n=s.getLastRow()-1;if(n<1)return [];
 if(n>max)throw Error('CMS data capacity reached: '+name+' has '+n+' rows. Archive older rows or extend the index.');
 const width=Math.min(columns||s.getLastColumn(),s.getLastColumn()),result=[];
 for(let offset=0;offset<n;offset+=1500){
  const size=Math.min(1500,n-offset);
  result.push.apply(result,s.getRange(offset+2,1,size,width).getValues());
 }
 return result;
}
function _guard_(fn){const l=LockService.getScriptLock();l.waitLock(15000);try{return fn();}finally{l.releaseLock();}}
function _log_(actor,action,id,note){_append_(APP.audit,[_time_(),actor,action,'resource',id,'','',_text_(note,300)]);}
function _checkSession_(token){if(!/^[a-f0-9-]{96,160}$/i.test(String(token||'')))throw Error('Session expired. Sign in again.');
 const cache=CacheService.getScriptCache(),value=cache.get('s_'+_hash_(token));if(value!==_hash_(_ownerEmail_()+'|'+_secret_()))throw Error('Session expired. Sign in again.');
 return _ownerEmail_();}
function apiRequestCode(email){
 const expected=_ownerEmail_(),candidate=_text_(email,254).toLowerCase();
 // Generic response prevents identifying admin by this endpoint.
 const response={ok:true,message:'If the account is authorized, a sign-in code will be sent.'};
 if(candidate!==expected)return response;
 return _guard_(function(){const c=CacheService.getScriptCache(),key='otp_rate_'+_hash_(expected);
  if(c.get(key))return response;
  if(MailApp.getRemainingDailyQuota()<1)throw Error('Email quota is unavailable. Try again later.');
  const stamp=new Date().toISOString().slice(0,10),p=PropertiesService.getScriptProperties(),daily=p.getProperty('MAIL_COUNT_'+stamp);
  if(Number(daily||0)>=30)throw Error('Daily sign-in quota reached.');
  const bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,Utilities.getUuid()+_secret_());
  const value=((((bytes[0]&255)*16777216)+((bytes[1]&255)*65536)+((bytes[2]&255)*256)+(bytes[3]&255))>>>0)%1000000;
  const code=('000000'+value).slice(-6),nonce=Utilities.getUuid();
  c.put('otp_'+_hash_(expected),JSON.stringify({hash:_hash_(code+'|'+nonce+'|'+_secret_()),nonce,tries:0}),APP.otpSeconds);
  try{MailApp.sendEmail(expected,'Your Content Manager sign-in code','Your one-time code: '+code+'\nExpires in ten minutes. Do not share it.');}
  catch(err){c.remove('otp_'+_hash_(expected));throw Error('Could not send the sign-in code.');}
  c.put(key,'1',60);p.setProperty('MAIL_COUNT_'+stamp,String(Number(daily||0)+1));return response;
 });
}
function apiVerifyCode(email,code){const owner=_ownerEmail_(),candidate=_text_(email,254).toLowerCase();
 if(candidate!==owner||!/^[0-9]{6}$/.test(String(code||'')))throw Error('Invalid or expired code.');
 return _guard_(function(){const c=CacheService.getScriptCache(),key='otp_'+_hash_(owner),raw=c.get(key);
  if(!raw)throw Error('Invalid or expired code.');const o=JSON.parse(raw);
  if(o.tries>=5){c.remove(key);throw Error('Too many attempts. Request another code.');}
  if(_hash_(code+'|'+o.nonce+'|'+_secret_())!==o.hash){o.tries++;if(o.tries>=5)c.remove(key);else c.put(key,JSON.stringify(o),APP.otpSeconds);throw Error('Invalid or expired code.');}
  c.remove(key);const token=Utilities.getUuid()+Utilities.getUuid()+Utilities.getUuid();
  c.put('s_'+_hash_(token),_hash_(owner+'|'+_secret_()),APP.sessionSeconds);_log_(owner,'LOGIN','OWNER','OTP verified');
  return {ok:true,token,expiresIn:APP.sessionSeconds};
 });
}
function apiLogout(token){try{_checkSession_(token);CacheService.getScriptCache().remove('s_'+_hash_(token));}catch(e){}return{ok:true};}
function _validUrl_(url){try{const u=String(url||'');return /^https:\/\/[a-z0-9.-]+(?::443)?(?:[\/?#][^\s<>"']*)?$/i.test(u)&&!u.includes('@')&&u.length<1501&&/\./.test(u.split('/')[2]);}catch(e){return false;}}
function _canonicalCategory_(value){let raw=_text_(value,120);return Object.prototype.hasOwnProperty.call(CATEGORY_NAMES,raw)?raw:Object.keys(CATEGORY_NAMES).find(k=>CATEGORY_NAMES[k]===raw)||'';}
function apiAdminBootstrap(token){_checkSession_(token);const rows=_rows_(APP.categories,100,8);
 return {categories:rows.filter(r=>String(r[6]).toUpperCase()==='TRUE').map(r=>({raw:r[1],name:CATEGORY_NAMES[r[1]]||r[1]})),
 counts:{source:_sheet_(APP.master).getLastRow()-1,new:_sheet_(APP.news).getLastRow()-1},latest:_rows_(APP.news,APP.maxNew,9).slice(-12).reverse().map(r=>({id:r[0],title:r[2],category:CATEGORY_NAMES[r[3]]||r[3],status:r[5]}))};}
function _recordFromSource_(id){const t=id.startsWith('N-')?APP.news:APP.master,h=_find_(t,id);if(!h)throw Error('Prompt record not found.');
 const v=h.v,parts=id.startsWith('P-')?String(v[20]||'').split('\ue000'):[];
 const item={id,title:id.startsWith('N-')?v[2]:parts[0],prompt:v[1],category:id.startsWith('N-')?v[3]:parts[1],subcategory:id.startsWith('N-')?v[4]:parts[2],status:id.startsWith('N-')?v[5]:'published'};
 if(id.startsWith('P-')){const ov=_find_(APP.overrides,id);if(ov){item.title=ov.v[1]||item.title;item.prompt=ov.v[2]||item.prompt;item.category=ov.v[3]||item.category;item.subcategory=ov.v[4]||item.subcategory;item.status=ov.v[5];}}
 return item;
}
function apiAdminSearch(token,q){
  _checkSession_(token);
  const raw=_text_(q,100),query=raw.toLowerCase();
  if(query.length<3)throw Error('Enter at least three characters.');
  const hits=[],used=new Set();
  const newer=_rows_(APP.news,APP.maxNew,9);
  for(let i=newer.length-1;i>=0&&hits.length<20;i--){
    const r=newer[i];
    if([r[0],r[2],r[3],r[4]].some(v=>String(v||'').toLowerCase().includes(query))){
      const id=String(r[0]);
      if(used.has(id))continue;
      hits.push({id,title:r[2],category:CATEGORY_NAMES[r[3]]||r[3],status:r[5]});
      used.add(id);
    }
  }
  // An exact original Prompt ID lives in Prompt_Master column A, not metadata column U.
  if(hits.length<20 && /^p-[a-z0-9-]{8,98}$/i.test(raw)){
    const match=_find_(APP.master,'P-'+raw.slice(2));
    if(match){
      const id=String(match.v[0]);
      if(!used.has(id)){
        const parts=String(match.v[20]||'').split('\ue000');
        const override=_find_(APP.overrides,id);
        hits.push({id,title:override&&override.v[1]||parts[0]||id,
          category:CATEGORY_NAMES[override&&override.v[3]||parts[1]]||override&&override.v[3]||parts[1],
          status:override?override.v[5]:'source'});
        used.add(id);
      }
    }
  }
  if(hits.length<20){
    const sheet=_sheet_(APP.master),n=sheet.getLastRow()-1;
    if(n>0){
      const finder=sheet.getRange(2,21,n,1).createTextFinder(query).matchCase(false);
      for(let i=hits.length;i<20;i++){
        const cell=finder.findNext();if(!cell)break;
        const row=cell.getRow(),id=String(sheet.getRange(row,1).getValue());
        if(used.has(id))continue;
        const parts=String(sheet.getRange(row,21).getValue()||'').split('\ue000');
        const override=_find_(APP.overrides,id);
        hits.push({id,title:override&&override.v[1]||parts[0]||id,
          category:CATEGORY_NAMES[override&&override.v[3]||parts[1]]||override&&override.v[3]||parts[1],
          status:override?override.v[5]:'source'});
        used.add(id);
      }
    }
  }
  return {items:hits,limited:hits.length>=20};
}
function apiAdminGet(token,id){_checkSession_(token);id=_text_(id,120);if(!/^(P-|N-)[a-z0-9-]{8,120}$/i.test(id))throw Error('Invalid prompt ID.');
 const item=_recordFromSource_(id);item.links=_rows_(APP.links,APP.maxLinks,11).filter(r=>String(r[1])===id&&String(r[7]).toLowerCase()!=='archived')
 .map(r=>({id:r[0],type:r[2],title:r[3],url:r[4],description:r[5]}));return item;}
function _validateSave_(d){if(!d||typeof d!=='object')throw Error('Invalid record.');
 const title=_text_(d.title,161),prompt=_text_(d.prompt,30001),category=_canonicalCategory_(d.category),subcategory=_text_(d.subcategory,120),status=_text_(d.status,15).toLowerCase();
 if(title.length<5||title.length>160)throw Error('Title must be 5 to 160 characters.');
 if(prompt.length<20||prompt.length>30000)throw Error('Prompt must be 20 to 30,000 characters.');
 if(!category)throw Error('Choose a valid category.');if(!['draft','published','archived'].includes(status))throw Error('Invalid publishing status.');
 if(!Array.isArray(d.links)||d.links.length>10)throw Error('Add no more than 10 resource links.');
 const links=d.links.map((x)=>{const type=_text_(x.type,30).toLowerCase(),t=_text_(x.title,160),url=_text_(x.url,1501),desc=_text_(x.description,400),id=_text_(x.id,100);
 if(!['video','application','template','download','guide'].includes(type)||t.length<3||!_validUrl_(url))throw Error('Use a descriptive title and a valid public HTTPS resource link.');
 if(id&&!/^R-[a-z0-9-]{8,100}$/i.test(id))throw Error('Invalid resource link ID.');return {id,type,title:t,url,description:desc};});
 if(new Set(links.map(x=>x.type+'|'+x.url)).size!==links.length)throw Error('Duplicate resource link.');
 const id=_text_(d.id,120);if(id&&!/^(P-|N-)[a-z0-9-]{8,120}$/i.test(id))throw Error('Invalid prompt ID.');
 return{id,title,prompt,category,subcategory,status,links};}
function apiAdminSave(token,data){
  const who=_checkSession_(token),d=_validateSave_(data);
  return _guard_(function(){
    let id=d.id,stored=null,tab='';
    if(id){
      tab=id.startsWith('P-')?APP.overrides:APP.news;
      stored=_find_(tab,id);
      if(!stored&&id.startsWith('P-')&&!_find_(APP.master,id))throw Error('Original prompt is missing.');
    }else{id='N-'+Utilities.getUuid();tab=APP.news;}
    // Validate link ownership before any mutation.
    const lr=_rows_(APP.links,APP.maxLinks,11);
    const own=lr.map((r,i)=>({r:r.slice(0,11),row:i+2})).filter(x=>String(x.r[1])===id);
    for(const item of d.links){
      if(item.id&&!own.find(x=>String(x.r[0])===item.id))
        throw Error('Resource link does not belong to this prompt. No changes made.');
    }
    const newRow=[id,d.prompt,d.title,d.category,d.subcategory,'draft','',_time_(),who];
    const oldRow=[id,d.title,d.prompt,d.category,d.subcategory,'draft','',_time_(),who,stored?Number(stored.v[9]||0)+1:1];
    const backup=stored?stored.v.slice(0,tab===APP.news?9:10):null;
    let promptRow=null;
    const createdLinkRows=[],included=[];
    try{
      if(stored){promptRow=stored.row;_update_(tab,promptRow,tab===APP.news?newRow:oldRow);}
      else{promptRow=_append_(tab,tab===APP.news?newRow:oldRow);}
      for(let i=0;i<d.links.length;i++){
        const l=d.links[i],match=own.find(x=>String(x.r[0])===l.id),rid=l.id||'R-'+Utilities.getUuid();
        const values=[rid,id,l.type,l.title,l.url,l.description,d.category,'draft',_time_(),who,i+1];
        const row=match?match.row:_append_(APP.links,values);
        if(match)_update_(APP.links,row,values);else createdLinkRows.push({row,values});
        included.push({row,rid,values});
      }
      for(const x of own){
        if(!included.some(y=>y.rid===String(x.r[0]))){const v=x.r.slice(0,11);v[7]='archived';v[8]=_time_();_update_(APP.links,x.row,v);}
      }
      SpreadsheetApp.flush();
      if(d.status==='published')for(const item of included){item.values[7]='published';_update_(APP.links,item.row,item.values);}
      const final=tab===APP.news?newRow:oldRow;final[5]=d.status;
      _update_(tab,promptRow,final);SpreadsheetApp.flush();
      CacheService.getScriptCache().remove('published_delta_v1');
      let warning='';try{_log_(who,stored?'UPDATE':'CREATE',id,d.status);}catch(e){warning='Content saved, but audit logging failed. Check Vault_Audit.';}
      return {ok:true,id,status:d.status,links:included.length,warning};
    }catch(err){
      // Best-effort compensation for partial Google Sheets writes. Sheets is NOT transactional.
      // Restore child links before restoring an existing published parent.
      const rollbackErrors=[];
      for(const item of own){try{_update_(APP.links,item.row,item.r);}catch(e){rollbackErrors.push('link restore: '+String(e.message||e));}}
      for(const item of createdLinkRows){
        try{const v=item.values.slice();v[7]='archived';_update_(APP.links,item.row,v);}
        catch(e){rollbackErrors.push('new link cleanup: '+String(e.message||e));}
      }
      if(promptRow!==null){
        try{
          if(backup)_update_(tab,promptRow,backup);
          else{const v=(tab===APP.news?newRow:oldRow).slice();v[5]='draft';_update_(tab,promptRow,v);}
        }catch(e){rollbackErrors.push('prompt restore: '+String(e.message||e));}
      }
      try{SpreadsheetApp.flush();CacheService.getScriptCache().remove('published_delta_v1');}
      catch(e){rollbackErrors.push('cache/flush: '+String(e.message||e));}
      if(rollbackErrors.length)throw Error('Save failed and rollback may be incomplete. Check the record in Owner Dashboard. Cause: '+String(err.message||err));
      throw Error('Save failed. Previous saved version restored when available: '+String(err.message||err));
    }
  });
}
function apiAdminArchive(token,id){const item=apiAdminGet(token,id);item.status='archived';return apiAdminSave(token,item);}
function apiAdminHealth(token){_checkSession_(token);return {ok:true,checkedAt:_time_(),tabs:[APP.master,APP.news,APP.overrides,APP.links,APP.categories,APP.audit].map(name=>({name,rows:_sheet_(name).getLastRow()-1}))};}

/** Owner-editable homepage: one JSON row per revision; a publish is a single cell-range write. */
const HOME_DEFAULTS=Object.freeze({
 eyebrow:'Practical AI & digital learning',
 line1:'AICHEATCODE.',
 line2:'Ready to use.',
 description:'Find task-specific AI prompts, explore practical examples, and develop digital skills through clear, reusable instructions and free resources.',
 primaryLabel:'Explore prompt library',
 secondaryLabel:'Download free guides',
 guideHeading:'Start with something useful.',
 footerLine:'Practical prompts, useful resources and digital learning.',
 seoDescription:'AICHEATCODE: searchable AI prompt archive, task-based resources and free learning downloads.'
});
const HOME_LIMITS=Object.freeze({eyebrow:70,line1:55,line2:55,description:320,primaryLabel:45,secondaryLabel:45,guideHeading:90,footerLine:150,seoDescription:160});
function _validateHome_(data){
 if(!data||typeof data!=='object')throw Error('Invalid homepage content.');
 const clean={};
 for(const key of Object.keys(HOME_LIMITS)){
  const value=String(data[key]==null?'':data[key]).replace(/[\u0000-\u001f\u007f]/g,' ').trim();
  if(value.length<2||value.length>HOME_LIMITS[key])throw Error('Invalid '+key+': use 2–'+HOME_LIMITS[key]+' characters.');
  clean[key]=value;
 }
 return clean;
}
function _siteSheet_(create){
 const ss=SpreadsheetApp.openById(APP.spreadsheetId);let s=ss.getSheetByName(APP.site);
 if(!s&&create){s=ss.insertSheet(APP.site);s.getRange(1,1,1,5).setValues([['Page_ID','Content_JSON','Status','Updated_At','Updated_By']]);s.setFrozenRows(1);}
 return s;
}
function _homeRow_(key){
 const s=_siteSheet_(false);if(!s)return null;
 const n=s.getLastRow()-1;if(n<1)return null;
 const c=s.getRange(2,1,n,1).createTextFinder(key).matchEntireCell(true).findNext();
 return c?{row:c.getRow(),values:s.getRange(c.getRow(),1,1,5).getValues()[0]}:null;
}
function _homeFromRow_(row,expected){
 if(!row||String(row.values[2]).toLowerCase()!==(expected||'published'))return null;
 try{return _validateHome_(JSON.parse(String(row.values[1])));}catch(e){return null;}
}
function apiAdminGetHome(token){_checkSession_(token);
 return {ok:true,defaults:HOME_DEFAULTS,draft:_homeFromRow_(_homeRow_('home_draft'),'draft'),
   published:_homeFromRow_(_homeRow_('home_live'))};
}
function apiAdminSaveHome(token,data,action){const who=_checkSession_(token),clean=_validateHome_(data);
 if(action!=='draft'&&action!=='publish')throw Error('Invalid homepage action.');
 return _guard_(function(){
  const sheet=_siteSheet_(true),key=action==='publish'?'home_live':'home_draft',prior=_homeRow_(key);
  const row=[key,JSON.stringify(clean),action==='publish'?'published':'draft',_time_(),who];
  const n=prior?prior.row:sheet.getLastRow()+1;
  sheet.getRange(n,1,1,5).setNumberFormat('@').setValues([row]);
  SpreadsheetApp.flush();
  CacheService.getScriptCache().remove('published_delta_v1');
  let warning='';try{_log_(who,action==='publish'?'PUBLISH_HOME':'SAVE_HOME_DRAFT','home','Homepage copy update');}
  catch(e){warning='Homepage saved, but audit log could not be written.';}
  return {ok:true,action,updatedAt:row[3],warning};
 });
}
function _publishedHome_(){return _homeFromRow_(_homeRow_('home_live'));}

/** Read-only delta. Always filter at server, including child links. */
function apiPublicChanges(){
 const cached=CacheService.getScriptCache().get('published_delta_v1');
 if(cached){try{return JSON.parse(cached);}catch(e){}}
 const newer=_rows_(APP.news,APP.maxNew,9),ov=_rows_(APP.overrides,APP.maxOverrides,10),resources=_rows_(APP.links,APP.maxLinks,11),hidden=new Set(),liveNew=new Map(),overrides=[];
 for(const r of newer){const id=String(r[0]||''),status=String(r[5]||'').toLowerCase();if(!id)continue;
  if(status==='published')liveNew.set(id,{id,prompt:String(r[1]||''),title:String(r[2]||''),category:CATEGORY_NAMES[r[3]]||r[3],subcategory:String(r[4]||''),status});}
 for(const r of ov){const id=String(r[0]||''),status=String(r[5]||'').toLowerCase();if(!id)continue;
  if(status!=='published')hidden.add(id);
  else overrides.push({id,title:String(r[1]||''),prompt:String(r[2]||''),category:CATEGORY_NAMES[r[3]]||r[3],subcategory:String(r[4]||''),status});}
 const visible=new Set([...liveNew.keys(),...overrides.map(p=>p.id)]);
 const links=[];for(const r of resources){const parent=String(r[1]||''),status=String(r[7]||'').toLowerCase(),type=String(r[2]||'').toLowerCase(),url=String(r[4]||'');
  if(status!=='published'||hidden.has(parent)||!_validUrl_(url))continue;
  if(!(parent.startsWith('P-')||visible.has(parent)))continue;
  if(!['video','application','template','download','guide'].includes(type))continue;
  links.push({id:String(r[0]||''),promptId:parent,type,title:String(r[3]||''),url,description:String(r[5]||'')});
 }
 const response={ok:true,updatedAt:_time_(),newPrompts:[...liveNew.values()],overrides,hidden:[...hidden],links,site:_publishedHome_()};
 const serialized=JSON.stringify(response);if(serialized.length<90000)CacheService.getScriptCache().put('published_delta_v1',serialized,60);
 return response;
}

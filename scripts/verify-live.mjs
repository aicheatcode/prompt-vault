const endpoint='https://script.google.com/macros/s/AKfycbzMLDBhLCwdwoDn-weuxKygHgoXvcoDA_-RWmcRPQQM9Wse0D6CQoHUOxkmFUOfWwc9XQ/exec?feed=public';
const response=await fetch(endpoint,{headers:{Accept:'application/json'},redirect:'follow',signal:AbortSignal.timeout(30000)});
if(!response.ok)throw Error('Live backend HTTP '+response.status);
if(!(response.headers.get('content-type')||'').includes('json'))throw Error('Live backend did not return JSON.');
const data=await response.json();
if(data.ok!==true||!['newPrompts','overrides','hidden','links'].every(k=>Array.isArray(data[k])))throw Error('Live backend schema mismatch.');
if([...data.newPrompts,...data.overrides].some(x=>x.status!=='published'))throw Error('Non-published content in public feed.');
console.log(JSON.stringify({ok:true,liveBackend:true,newPrompts:data.newPrompts.length,overrides:data.overrides.length,hidden:data.hidden.length,checkedAt:new Date().toISOString()}));

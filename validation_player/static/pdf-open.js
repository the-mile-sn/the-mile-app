'use strict';
(async()=>{
  const id=new URLSearchParams(location.search).get('id');
  if(!id){history.back();return;}
  try{
    const r=await fetch('/api/documents/'+encodeURIComponent(id),{credentials:'same-origin'});
    if(!r.ok)throw new Error('pdf');
    const blob=await r.blob();
    const url=URL.createObjectURL(blob);
    location.replace(url);
  }catch(e){history.back();}
})();
"use strict";
/* On-device browser translation only. No external API or network fallback. */
(function(root){
 const locales={ "pt-PT":"pt", "en-GB":"en" };
 function supported(){return typeof root.Translator?.create==="function";}
 function clean(copy){
  const title=typeof copy?.title==="string"?copy.title.trim():"";
  const body=typeof copy?.body==="string"?copy.body.trim():"";
  if(!title||!body||title.length>120||body.length>1000)throw Error("invalid_copy");
  return {title,body};
 }
 async function translate(copy,source,target,onProgress){
  const input=clean(copy);
  if(!supported()||!locales[source]||!locales[target]||source===target)
   throw Error("translation_unavailable");
  let translator;
  try{
   // Called directly by the review button; create retains the user gesture.
   translator=await root.Translator.create({
    sourceLanguage:locales[source],targetLanguage:locales[target],
    monitor(m){m.addEventListener("downloadprogress",e=>{
     if(typeof onProgress==="function")onProgress(Math.round(e.loaded*100));
    });}
   });
   const title=await translator.translate(input.title);
   const body=await translator.translate(input.body);
   return clean({title,body});
  }finally{translator?.destroy?.();}
 }
 root.tmNotificationTranslation=Object.freeze({supported,translate});
})(globalThis);

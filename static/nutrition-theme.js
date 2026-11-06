"use strict";
(()=>{
 const key="tm-admin-theme";
 let theme="dark";
 try{theme=localStorage.getItem(key)==="light"?"light":"dark"}catch(_){}
 document.documentElement.dataset.adminTheme=theme;
 const back=document.querySelector("[data-nutrition-back]");
 if(back)back.addEventListener("click",event=>{
  event.preventDefault();
  let sameOrigin=false;
  try{sameOrigin=!!document.referrer&&new URL(document.referrer).origin===location.origin&&new URL(document.referrer).pathname!==location.pathname;}catch(_){}
  if(sameOrigin&&history.length>1)history.back();
  else location.assign("/");
 });
})();

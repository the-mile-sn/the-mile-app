"use strict";
/* Explicit user activation only. No timers, polling or auto-subscription. */
window.tmNotificationActivation=(()=>{
 let ctx=null,state=null,loading=null,dialog=null,profile=null,busy=false,promptedHere=false,generation=0;
 const path="/api/v2/notifications/activation";
 const t=(pt,en)=>ctx?.language()==="en"?en:pt;
 function make(tag,cls,text){
  const e=document.createElement(tag);if(cls)e.className=cls;
  if(text!==undefined)e.textContent=text;return e;
 }
 function device(){
  try{
   const key="the-mile-notification-device-v2";
   let value=localStorage.getItem(key);
   if(!/^[a-zA-Z0-9-]{32,64}$/.test(value||"")){
    value=crypto.randomUUID?.()||Array.from(crypto.getRandomValues(new Uint8Array(24)),v=>v.toString(16).padStart(2,"0")).join("");
    localStorage.setItem(key,value);
   }
   return value;
  }catch(_){return null;}
 }
 const supported=()=>typeof Notification!=="undefined"&&"serviceWorker" in navigator&&"PushManager" in window;
 const valid=(token)=>token===generation&&!!ctx&&ctx.active();
 let lockedScroll=null;
 function lockBackground(){
  if(lockedScroll!==null)return;
  lockedScroll=window.scrollY||0;
  const root=document.documentElement;
  root.style.setProperty("--tm-notification-scroll-top",(-lockedScroll)+"px");
  root.classList.add("tm-notification-sheet-locked");
 }
 function unlockBackground(){
  if(lockedScroll===null)return;
  const y=lockedScroll;lockedScroll=null;
  const root=document.documentElement;
  root.classList.remove("tm-notification-sheet-locked");
  root.style.removeProperty("--tm-notification-scroll-top");
  window.scrollTo(0,y);
 }
 function closePrompt(){
  try{if(dialog){dialog.close();dialog.remove();dialog=null;}}
  finally{unlockBackground();}
 }
 function reset(){
  generation++;closePrompt();profile?.remove();profile=null;ctx=null;state=null;loading=null;busy=false;promptedHere=false;
 }
 function decode(value){
  const s=value.replace(/-/g,"+").replace(/_/g,"/");
  return Uint8Array.from(atob(s+"=".repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));
 }
 async function configure(){
  if(!ctx||!ctx.active()||!supported()||!ctx.device)return null;
  if(state)return state;
  if(loading)return loading;
  const token=generation,request=ctx.request,id=ctx.device;
  loading=(async()=>{
   try{
    const data=await request(path+"?device="+encodeURIComponent(id),"GET");
    if(valid(token)&&typeof data.publicKey==="string"&&data.publicKey)state=data;
   }catch(_){/* Optional functionality never blocks the app. */}
   return valid(token)?state:null;
  })().finally(()=>{if(valid(token))loading=null;});
  return loading;
 }
 async function save(action,subscription){
  const token=generation,request=ctx.request,id=ctx.device;
  const data=await request(path,"POST",{action,device:id,...(subscription?{subscription}:{})});
  if(!valid(token))return false;
  state={...state,...data};return true;
 }
 function paintProfile(message=""){
  if(!profile?.isConnected||!ctx||!state)return;
  profile.replaceChildren();
  const button=make("button","tm-notification-activation-button",
   state.active?t("Desativar notificações","Disable notifications"):t("Ativar notificações","Enable notifications"));
  button.type="button";button.disabled=busy;
  button.onclick=()=>state.active?change(false):change(true);
  profile.append(button);
  const caption=message||(state.active&&Notification.permission==="granted"
   ?t("Notificações ativas neste dispositivo.","Notifications enabled on this device.")
   :Notification.permission==="denied"
    ?t("Permissão bloqueada. Podes alterá-la nas definições do dispositivo.","Permission blocked. You can change it in your device settings.")
    :t("Notificações desativadas neste dispositivo.","Notifications disabled on this device."));
  profile.append(make("p","tm-notification-activation-caption",caption));
 }
 function showPrompt(){
  if(!ctx||!state||state.prompted||promptedHere||state.active||Notification.permission==="denied"||!ctx.active())return;
  promptedHere=true;
  const d=make("dialog","tm-notification-activation-dialog");
  d.setAttribute("aria-labelledby","tm-notification-activation-title");
  const title=make("h2","",t("Ativar notificações","Enable notifications"));title.id="tm-notification-activation-title";title.tabIndex=-1;title.setAttribute("autofocus","");
  const icon=make("div","tm-notification-sheet-icon");icon.setAttribute("aria-hidden","true");
  icon.innerHTML='<svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 9h18c0-1-3-2-3-9ZM10 21h4"/></svg>';
  const body=make("p","",t("Recebe informações importantes e atualizações sobre o teu acompanhamento.","Receive important information and updates about your ongoing support."));
  const actions=make("div","tm-notification-activation-actions");
  const yes=make("button","is-primary",t("Ativar notificações","Enable notifications"));yes.type="button";
  const no=make("button","",t("Agora não","Not now"));no.type="button";
  const feedback=make("p","tm-notification-activation-feedback");feedback.setAttribute("role","status");
  actions.append(yes,no);d.append(icon,title,body,actions,feedback);
  yes.onclick=()=>change(true);
  no.onclick=()=>dismiss();
  d.addEventListener("cancel",e=>{e.preventDefault();dismiss();});
  document.body.append(d);dialog=d;
  try{lockBackground();d.showModal();title.focus({preventScroll:true});}catch(_){closePrompt();}
 }
 async function dismiss(){
  if(!ctx||busy)return;
  const token=generation;
  closePrompt();
  try{await save("acknowledge");}catch(_){/* Keep the app available; retry through Profile. */}
  if(valid(token))paintProfile();
 }
 function promptFeedback(message){
  const el=dialog?.querySelector(".tm-notification-activation-feedback");
  if(el)el.textContent=message;
 }
 async function change(enable){
  if(!ctx||!state||busy||!ctx.active())return;
  const token=generation;
  busy=true;paintProfile();
  for(const b of dialog?.querySelectorAll("button")||[])b.disabled=true;
  let message="";
  try{
   if(enable){
    // Request native permission directly from the user's button gesture,
    // before any awaited network or service worker operation.
    const permission=Notification.permission==="default"?await Notification.requestPermission():Notification.permission;
    if(!valid(token))return;
    if(permission!=="granted"){
     await save("acknowledge");if(valid(token))closePrompt();return;
    }
    const registration=await navigator.serviceWorker.getRegistration();
    if(!valid(token))return;
    if(!registration?.active)throw Error("worker_not_ready");
    const applicationServerKey=decode(state.publicKey);
    let subscription=await registration.pushManager.getSubscription();
    if(!valid(token))return;
    if(subscription){
     const existing=subscription.options?.applicationServerKey;
     if(existing&&Array.from(new Uint8Array(existing)).join(",")!==Array.from(applicationServerKey).join(","))throw Error("subscription_key_mismatch");
    }else{
     subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey});
    }
    if(!valid(token))return;
    if(await save("activate",subscription.toJSON()))closePrompt();
   }else{
    // Disable delivery for this account/device in the new store only.
    // Do not revoke the browser permission or touch the legacy subscription.
    await save("deactivate");
   }
  }catch(_){
   message=t("Não foi possível alterar as notificações. Tenta novamente no Perfil.","Unable to change notifications. Try again in Profile.");
   if(valid(token)){promptFeedback(message);}
  }finally{
   if(valid(token)){
    busy=false;paintProfile(message);
    for(const b of dialog?.querySelectorAll("button")||[])b.disabled=false;
   }
  }
 }
 async function start(options){
  reset();
  ctx={...options,device:device()};
  const token=generation;
  if(await configure()&&valid(token))showPrompt();
 }
 async function mount(container){
  if(!container||!ctx||!ctx.active())return;
  const token=generation;
  if(!await configure()||!valid(token)||!container.isConnected||container.hidden)return;
  container.querySelector(".tm-notification-activation")?.remove();
  profile=make("div","tm-notification-activation");
  const header=container.querySelector(".profile-subpage-header");
  if(header)header.after(profile);else container.prepend(profile);
  paintProfile();
 }
 function clearProfile(container){
  if(container)container.querySelector(".tm-notification-activation")?.remove();
  if(profile&&!profile.isConnected)profile=null;
 }
 return {start,mount,reset,clearProfile};
})();

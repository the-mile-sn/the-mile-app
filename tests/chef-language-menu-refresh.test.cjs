"use strict";
/* In-memory Chef locale-switch regression, no real requests or accounts. */
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");

const chef=fs.readFileSync("static/chef.js","utf8");

test("Chef language preference reloads translated week menus before displaying the chosen language",()=>{
 const start=chef.indexOf("function renderProfile(root){");
 const end=chef.indexOf("const notifications=node",start);
 assert.ok(start>=0&&end>start);
 const handler=chef.slice(start,end);
 const saved=handler.indexOf('await request("/api/v2/chef/preferences","PUT",{language:code})');
 const plans=handler.indexOf('await request("/api/v2/chef/plans")');
 const week=handler.indexOf("await loadWeek();");
 assert.ok(saved>=0 && plans>saved && week>plans,
   "A successful Chef locale preference must be persisted before fetching translated menus");
 assert.doesNotMatch(handler.slice(saved),/\brender\(\);/,
   "Must not re-render the old PT menus cache immediately after EN was selected");
 assert.match(chef,/const q="\?start="\+weekKey\+"&end="\+dateKey\(end\)/);
 assert.match(chef,/request\("\/api\/v2\/chef\/menus"\+q\)/);
 assert.match(chef,/menus=menuResponse\.menus\|\|\[\]/);
 assert.match(chef,/appendChefMenuDish\(preview,plannedMenu\(date,meal\),txt\(\)\.pending\)/);
});

test("Existing Chef week loader updates Home and Menus PT → EN → PT without changing dish identity",async()=>{
 const start=chef.indexOf("async function loadWeek(){");
 const end=chef.indexOf("\nfunction colorFor(",start);
 assert.ok(start>=0&&end>start);
 const canonical={kind:"dish",dish_id:"dish-1",menu_date:"2026-11-23",meal:"lunch",
                  value:"Salmão com crosta de ervas"};
 const views=[], urls=[];
 const context={
   lang:"pt",selectedDay:new Date(2026,10,23,12),
   chefWeekRequestId:0,chefSkeletonTimer:null,chefSkeletonVisible:false,
   activeTab:"profile",days:[],colors:{},menus:[],executions:[],
   clearTimeout(){},el:()=>({hidden:false}),
   renderChefHomeSkeleton(){throw Error("Profile must not trigger Home skeletons")},
   clearChefSkeleton(){this.chefSkeletonVisible=false},
   monday(d){const date=new Date(d);date.setDate(date.getDate()-(date.getDay()+6)%7);return date},
   shift(d,n){const date=new Date(d);date.setDate(date.getDate()+n);return date},
   dateKey(d){return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-")},
   async request(url){
     urls.push(url);
     if(url.startsWith("/api/v2/chef/menus?")){
       const value=context.lang==="en"?"Herb-crusted salmon":canonical.value;
       return {menus:[{...canonical,value}]};
     }
     if(url.startsWith("/api/v2/chef/calendar?"))return {days:[],effective_colors:{}};
     if(url.startsWith("/api/v2/chef/menu-executions?"))return {executions:[]};
     throw Error("Unexpected route "+url);
   },
   render(){views.push({lang:context.lang,menus:context.menus.map(item=>({...item}))})}
 };
 vm.createContext(context);
 vm.runInContext(chef.slice(start,end),context);
 for(const language of ["pt","en","pt"]){
   context.lang=language;
   await vm.runInContext("loadWeek()",context);
 }
 assert.equal(views.length,3);
 assert.deepEqual(views.map(view=>view.menus[0].value),
   [canonical.value,"Herb-crusted salmon",canonical.value]);
 assert.deepEqual(views.map(view=>view.lang),["pt","en","pt"]);
 for(const view of views){
   const row=view.menus[0];
   assert.equal(row.dish_id,canonical.dish_id);
   assert.equal(row.kind,"dish");
   assert.equal(row.menu_date,canonical.menu_date);
   assert.equal(row.meal,canonical.meal);
 }
 assert.equal(canonical.value,"Salmão com crosta de ervas");
 assert.equal(urls.length,9);
 assert.ok(urls.every(url=>url.includes("start=2026-11-23&end=2026-11-29")));
});

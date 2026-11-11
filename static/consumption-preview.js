const preset={rice:150,chicken:120,oil:10};
const macros={rice:[1.3,28,0.3,130],chicken:[31,0,3.6,165],oil:[0,0,100,900]};
let mode='all',saved=false;
function recalc(){
 const totals=[0,0,0,0];
 for(const id of Object.keys(preset)){
  const input=document.getElementById(id),check=document.querySelector('[data-food="'+id+'"]');
  if(mode==='all'){check.checked=true;input.value=preset[id];}
  if(mode==='none'){check.checked=false;input.value=0;}
  check.disabled=mode!=='partial';
  input.disabled=mode!=='partial'||!check.checked;
  const g=mode==='none'||!check.checked?0:Math.max(0,Number(input.value)||0);
  macros[id].forEach((n,i)=>totals[i]+=n*g/100);
 }
 ['protein','carbs','fat','kcal'].forEach((key,i)=>document.getElementById(key).textContent=Math.round(totals[i]));
 document.getElementById('saved').textContent='';
}
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{
 mode=b.dataset.mode;
 document.querySelectorAll('[data-mode]').forEach(x=>x.classList.toggle('active',x===b));
 recalc();
});
document.querySelectorAll('.food-check').forEach(check=>check.onchange=()=>{
 const input=document.getElementById(check.dataset.food);
 input.value=check.checked?preset[check.dataset.food]:0;
 recalc();
});
document.querySelectorAll('#foods input[type=number]').forEach(i=>i.oninput=recalc);
document.getElementById('save').onclick=()=>{
 saved=true;
 document.getElementById('delete').hidden=false;
 document.getElementById('saved').textContent='Registo simulado. Nenhum dado foi enviado.';
};
document.getElementById('delete').onclick=()=>{
 if(!saved||!confirm('Eliminar este registo simulado?'))return;
 saved=false;document.getElementById('delete').hidden=true;
 document.getElementById('saved').textContent='Registo simulado eliminado.';
};
recalc();
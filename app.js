const makeRequestId=()=>{if(typeof crypto.randomUUID==='function')return crypto.randomUUID();const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const h=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;};
const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
// Navigation stays usable with keyboard, touch and progressive enhancement.
const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
const menu=$('.menu-toggle'),mobile=$('#mobile-menu'),header=$('.header');
const setMobile=open=>{
  menu.setAttribute('aria-expanded',String(open));
  menu.setAttribute('aria-label',open?'Close navigation':'Open navigation');
  mobile.hidden=!open;
  document.body.classList.toggle('nav-open',open);
  $$('main,.footer').forEach(el=>el.inert=open);
};
menu?.addEventListener('click',()=>setMobile(menu.getAttribute('aria-expanded')!=='true'));
mobile?.addEventListener('click',e=>{if(e.target.closest('a'))setMobile(false)});
const desktopLayout=window.matchMedia('(min-width:1121px)');
desktopLayout.addEventListener('change',()=>{setMobile(false);$$('.nav-dropdown').forEach(x=>x.open=false)});
window.addEventListener('pageshow',()=>setMobile(false));
$$('.nav-dropdown').forEach(drop=>drop.addEventListener('toggle',()=>{
  if(drop.open)$$('.nav-dropdown').filter(x=>x!==drop).forEach(x=>x.open=false);
}));
document.addEventListener('click',e=>{if(!e.target.closest('.nav-dropdown'))$$('.nav-dropdown').forEach(x=>x.open=false)});
document.addEventListener('focusin',e=>{
  $$('.nav-dropdown[open]').forEach(drop=>{if(!drop.contains(e.target))drop.open=false});
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    $$('.nav-dropdown[open]').forEach(x=>{x.open=false;$('summary',x).focus()});
    if(menu?.getAttribute('aria-expanded')==='true'){setMobile(false);menu.focus()}
  }
  if(e.key==='Tab'&&menu?.getAttribute('aria-expanded')==='true'){
    const focusable=$$('a,button,summary',header).filter(el=>el.getClientRects().length);
    const first=focusable[0],last=focusable.at(-1);
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
    if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
  }
});
// Match the sticky page navigation offset to the responsive header.
const updateHeaderHeight=()=>document.documentElement.style.setProperty('--header-height',`${Math.ceil($('.nav').getBoundingClientRect().height+1)}px`);
updateHeaderHeight();
if('ResizeObserver' in window)new ResizeObserver(updateHeaderHeight).observe($('.nav'));
$$('.desktop-nav .nav-dropdown').forEach(drop=>{
  const section=document.body.dataset.page;
  const active=$('[aria-current="page"]',drop)||(section==='service'&&$('.mega',drop))||(section==='industry'&&$('a[href="/industries/"]',drop));
  if(active)$('summary',drop).classList.add('current-section');
});
$$('[data-tabs]').forEach(group=>{
  const tabs=$$('[role=tab]',group),panels=$$('[role=tabpanel]',group),list=$('[role=tablist]',group);
  const orient=()=>list.setAttribute('aria-orientation','horizontal');
  orient();window.addEventListener('resize',orient,{passive:true});
  panels.forEach(panel=>panel.tabIndex=0);
  const activate=tab=>{
    if(tab.getAttribute('aria-selected')==='true')return;
    tabs.forEach(t=>{const active=t===tab;t.setAttribute('aria-selected',String(active));t.tabIndex=active?0:-1});
    panels.forEach(panel=>{
      panel.hidden=panel.id!==tab.getAttribute('aria-controls');
      panel.getAnimations().forEach(animation=>animation.cancel());
      if(!panel.hidden&&!reducedMotion.matches)panel.animate([{opacity:.3,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:260,easing:'cubic-bezier(.2,.7,.2,1)'});
    });
  };
  tabs.forEach((tab,i)=>{
    tab.addEventListener('click',()=>activate(tab));
    tab.addEventListener('keydown',e=>{
      let next;const vertical=list.getAttribute('aria-orientation')==='vertical';
      if(e.key===(vertical?'ArrowDown':'ArrowRight'))next=(i+1)%tabs.length;
      if(e.key===(vertical?'ArrowUp':'ArrowLeft'))next=(i-1+tabs.length)%tabs.length;
      if(e.key==='Home')next=0;if(e.key==='End')next=tabs.length-1;
      if(next!==undefined){e.preventDefault();activate(tabs[next]);tabs[next].focus()}
    });
  });
});
// Small, one-time entrances reinforce hierarchy without hiding content before JS.
if('IntersectionObserver' in window){
  const reveal=new IntersectionObserver(entries=>entries.forEach(entry=>{
    if(!entry.isIntersecting)return;
    if(!reducedMotion.matches)entry.target.animate([{opacity:.55,transform:'translateY(16px)'},{opacity:1,transform:'none'}],{duration:520,easing:'cubic-bezier(.2,.7,.2,1)'});
    reveal.unobserve(entry.target);
  }),{threshold:.15});
  $$('.section-heading,.home-capability-grid').forEach(el=>reveal.observe(el));
}
reducedMotion.addEventListener('change',()=>{if(reducedMotion.matches)document.getAnimations().forEach(animation=>animation.cancel())});
// A reader can jump, keep their place, or continue scrolling naturally.
const pageLinks=$$('.section-nav-links a,.product-jump a,.reading-layout aside a');
if(pageLinks.length){
  const entries=pageLinks.map(link=>({link,target:$(link.getAttribute('href'))})).filter(x=>x.target);
  let scheduled=false;
  const updateLocation=()=>{
    const offset=$('.header').getBoundingClientRect().height+($('.section-nav,.product-jump')?.getBoundingClientRect().height||0)+50;
    let active=entries[0],bestTop=-Infinity;
    entries.forEach(entry=>{
      const top=entry.target.getBoundingClientRect().top;
      if(top<=offset&&(top>bestTop+1||(Math.abs(top-bestTop)<=1&&entry.link.hash===location.hash))){active=entry;bestTop=top}
    });
    const changed=active.link.getAttribute('aria-current')!=='location';
    entries.forEach(entry=>{if(entry===active)entry.link.setAttribute('aria-current','location');else entry.link.removeAttribute('aria-current')});
    const rail=active.link.closest('.section-nav-links,.product-jump nav');
    if(changed&&rail&&rail.scrollWidth>rail.clientWidth){
      const item=active.link.getBoundingClientRect(),bounds=rail.getBoundingClientRect();
      if(item.left<bounds.left||item.right>bounds.right)rail.scrollBy({left:item.left-bounds.left-18,behavior:reducedMotion.matches?'instant':'smooth'});
    }
    scheduled=false;
  };
  window.addEventListener('scroll',()=>{if(!scheduled){scheduled=true;requestAnimationFrame(updateLocation)}},{passive:true});
  window.addEventListener('resize',updateLocation,{passive:true});
  window.addEventListener('hashchange',updateLocation);
  updateLocation();
}
// Preserve the fragment in the URL and move keyboard focus to the requested section.
$$('a[href^="#"]').forEach(link=>link.addEventListener('click',()=>{
  const target=$(link.getAttribute('href'));
  if(target){if(!target.hasAttribute('tabindex'))target.tabIndex=-1;target.focus({preventScroll:true})}
}));
$$('.motion-toggle').forEach(button=>button.addEventListener('click',()=>{const paused=button.getAttribute('aria-pressed')!=='true';button.setAttribute('aria-pressed',String(paused));button.textContent=paused?'Resume motion ▷':'Pause motion Ⅱ';$('.marquee-track',button.closest('.tech-strip'))?.classList.toggle('paused',paused);}));
$$('[data-filter-scope]').forEach(scope=>{let category='All';const input=$('[data-search-input]',scope),items=$$('.filter-item',scope),empty=$('.empty-state',scope);const apply=()=>{const query=(input?.value||'').trim().toLowerCase();let count=0;items.forEach(item=>{const show=(category==='All'||item.dataset.category===category)&&item.dataset.search.toLowerCase().includes(query);item.hidden=!show;if(show)count++;});if(empty)empty.hidden=count!==0;};$$('[data-filter]',scope).forEach(button=>button.addEventListener('click',()=>{category=button.dataset.filter;$$('[data-filter]',scope).forEach(b=>b.setAttribute('aria-pressed',String(b===button)));apply();}));input?.addEventListener('input',apply);});
const form=$('#contact-form');
if(form){const params=new URLSearchParams(location.search),service=$('#service');if([...service.options].some(o=>o.value===params.get('service')))service.value=params.get('service');let requestId=makeRequestId();form.addEventListener('submit',async e=>{e.preventDefault();if(!form.reportValidity())return;const button=$('button[type=submit]',form),status=$('#form-status');const original=button.innerHTML;button.disabled=true;button.textContent='Saving your enquiry…';status.textContent='';const data=Object.fromEntries(new FormData(form));data.request_id=requestId;data.campaign={};for(const key of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term'])if(params.has(key))data.campaign[key]=params.get(key);try{const response=await fetch('/api/leads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const result=await response.json();if(!response.ok||!result.ok)throw Error(result.error||'We could not save your enquiry. Please try again.');form.hidden=true;const success=$('#form-success');success.hidden=false;$('.reference',success).textContent='Your reference: '+result.reference;success.focus();}catch(error){status.textContent=error.message||'Connection interrupted. Please try again or email hello@cosmonet.ai.';}finally{button.disabled=false;button.innerHTML=original;}});$('#new-enquiry')?.addEventListener('click',()=>{requestId=makeRequestId();form.reset();form.hidden=false;$('#form-success').hidden=true;$('#form-status').textContent='';$('#name').focus();});}

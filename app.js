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
if(form){
  const email=$('#email',form),emailError=$('#email-error',form),button=$('button[type="submit"]',form);
  const status=$('#form-status'),success=$('#form-success'),retry=$('#form-retry');
  const verification=$('#form-verification'),verificationStatus=$('#verification-status');
  const changedNotice=$('#changed-enquiry-notice'),changedDescription=$('#changed-enquiry-description'),sendChanged=$('#send-changed-enquiry');
  const params=new URLSearchParams(location.search),service=$('#service'),originalButton=button.innerHTML,serverErrors=new Map();
  let configured=false,initializing=false,submitting=false,turnstileRequired=true,token='',widgetId=null,widgetGeneration=0,scriptPromise;
  let timeoutMs=15000,cooldownUntil=0,cooldownTimer,requestId=makeRequestId(),lastPayload=null;
  let uncertainCommit=false,approvedPayload=null,forceNewEnquiry=false;
  if([...service.options].some(option=>option.value===params.get('service')))service.value=params.get('service');
  const showStatus=(message,isError=false,focus=false)=>{
    status.textContent=message;
    status.classList.toggle('form-error',isError);
    if(focus)status.focus();
  };
  const updateButton=()=>{
    const remaining=Math.max(0,Math.ceil((cooldownUntil-Date.now())/1000));
    button.disabled=!configured||initializing||submitting||(turnstileRequired&&!token)||remaining>0;
    sendChanged.disabled=!configured||initializing||submitting||remaining>0;
    retry.disabled=initializing||submitting;
    if(submitting)button.textContent='Saving your enquiry…';
    else if(initializing)button.textContent='Preparing enquiry form…';
    else if(remaining)button.textContent=`Please wait (${remaining}s)`;
    else button.innerHTML=originalButton;
    form.setAttribute('aria-busy',String(initializing||submitting));
    if(remaining){
      clearTimeout(cooldownTimer);
      cooldownTimer=setTimeout(updateButton,Math.min(1000,Math.max(1,cooldownUntil-Date.now())));
    }
  };
  const readJson=async response=>{
    if(!response.headers.get('Content-Type')?.toLowerCase().includes('application/json'))return null;
    try{return await response.json()}catch(err){if(err.name==='AbortError')throw err;return null}
  };
  const clearServerError=field=>{
    const note=serverErrors.get(field);
    if(!note)return;
    field.setCustomValidity('');field.removeAttribute('aria-invalid');
    if(field!==email){
      note.remove();
      const descriptions=(field.getAttribute('aria-describedby')||'').split(' ').filter(id=>id&&id!==note.id);
      if(descriptions.length)field.setAttribute('aria-describedby',descriptions.join(' '));else field.removeAttribute('aria-describedby');
    }
    serverErrors.delete(field);
  };
  const validateEmail=()=>{
    const valid=email.validity.valid;
    emailError.textContent=valid?'':serverErrors.has(email)?email.validationMessage:email.validity.valueMissing?'Enter your email address.':'Enter a valid email address, such as name@company.com.';
    emailError.hidden=valid;
    if(valid)email.removeAttribute('aria-invalid');else email.setAttribute('aria-invalid','true');
    return valid;
  };
  const showFieldErrors=fieldErrors=>{
    let first;
    if(!fieldErrors||typeof fieldErrors!=='object')return first;
    for(const [name,message] of Object.entries(fieldErrors)){
      const field=form.elements.namedItem(name);
      if(!(field instanceof HTMLInputElement||field instanceof HTMLSelectElement||field instanceof HTMLTextAreaElement)||typeof message!=='string'||!message.trim())continue;
      clearServerError(field);
      const note=field===email?emailError:document.createElement('span');
      if(field!==email){
        note.id=`${field.id||name}-error`;note.className='field-error';note.setAttribute('aria-live','polite');
        const anchor=field.type==='checkbox'?field.closest('label'):field;
        anchor.insertAdjacentElement('afterend',note);
        field.setAttribute('aria-describedby',[field.getAttribute('aria-describedby'),note.id].filter(Boolean).join(' '));
      }
      note.textContent=message.slice(0,300);note.hidden=false;
      field.setCustomValidity(note.textContent);field.setAttribute('aria-invalid','true');serverErrors.set(field,note);
      first=first||field;
    }
    return first;
  };
  const getPayload=()=>{
    const values=new FormData(form),data={};
    for(const name of ['name','company','email','service','interest','message','consent','website'])data[name]=String(values.get(name)||'');
    data.campaign={};
    for(const key of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term'])if(params.has(key))data.campaign[key]=params.get(key).replace(/[\u0000-\u001f\u007f]/g,'').slice(0,200);
    return data;
  };
  const confirmChangedEnquiry=conflict=>{
    changedDescription.textContent=conflict?'A previous enquiry already uses this request reference. Sending these details will create a new enquiry.':'Your previous attempt may already have been received. Sending these changed details will create a new enquiry. To retry the earlier enquiry, restore its details.';
    changedNotice.hidden=false;changedNotice.focus();
  };
  const resetVerification=()=>{
    token='';
    if(turnstileRequired&&widgetId!==null){
      verificationStatus.textContent='Complete the verification to send your enquiry.';
      try{window.turnstile.reset(widgetId)}catch{
        retry.hidden=false;
        verificationStatus.textContent='Verification could not restart. Select “Try form again” or email hello@cosmonet.ai.';
      }
    }
    updateButton();
  };
  const loadTurnstile=()=>{
    if(typeof window.turnstile?.render==='function')return Promise.resolve(window.turnstile);
    if(scriptPromise)return scriptPromise;
    scriptPromise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');let settled=false;
      const finish=err=>{
        if(settled)return;
        settled=true;clearTimeout(timer);script.onload=null;script.onerror=null;
        if(err){script.remove();reject(err)}else resolve(window.turnstile);
      };
      const timer=setTimeout(()=>finish(new Error('Verification unavailable')),timeoutMs);
      script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;
      script.onload=()=>{
        if(typeof window.turnstile?.render!=='function')return finish(new Error('Verification unavailable'));
        if(typeof window.turnstile.ready==='function')window.turnstile.ready(()=>finish());else finish();
      };
      script.onerror=()=>finish(new Error('Verification unavailable'));
      document.head.append(script);
    }).catch(err=>{scriptPromise=null;throw err});
    return scriptPromise;
  };
  const initializeForm=async()=>{
    if(initializing||submitting)return;
    initializing=true;configured=false;token='';retry.hidden=true;
    const generation=++widgetGeneration;
    if(widgetId!==null){try{window.turnstile.remove(widgetId)}catch{}widgetId=null}
    verification.hidden=true;showStatus('Preparing the enquiry form…');updateButton();
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await fetch('/api/form-config',{headers:{Accept:'application/json'},cache:'no-store',signal:controller.signal,mode:'same-origin',redirect:'error'});
      const config=await readJson(response);
      if(!response.ok||config?.available!==true)throw new Error('Form unavailable');
      turnstileRequired=config.turnstileRequired!==false;
      timeoutMs=Number.isFinite(config.submissionTimeoutMs)?Math.min(30000,Math.max(1000,config.submissionTimeoutMs)):15000;
      if(turnstileRequired){
        if(typeof config.turnstileSiteKey!=='string'||!config.turnstileSiteKey.trim())throw new Error('Verification unavailable');
        verification.hidden=false;verificationStatus.textContent='Loading verification…';
        const turnstile=await loadTurnstile();
        widgetId=turnstile.render('#turnstile-widget',{
          sitekey:config.turnstileSiteKey,theme:'light',size:'flexible',action:'contact',
          'response-field':false,'refresh-expired':'manual',
          callback:responseToken=>{
            if(generation!==widgetGeneration)return;
            token=typeof responseToken==='string'?responseToken:'';
            retry.hidden=Boolean(token);
            verificationStatus.textContent=token?'Verification complete.':'Complete the verification to send your enquiry.';
            updateButton();
          },
          'expired-callback':()=>{
            if(generation!==widgetGeneration)return;
            token='';if(!submitting)resetVerification();else updateButton();
          },
          'error-callback':()=>{
            if(generation!==widgetGeneration)return;
            token='';retry.hidden=false;
            verificationStatus.textContent='Verification could not finish. Select “Try form again” or email hello@cosmonet.ai.';
            updateButton();
          }
        });
        if(widgetId===null||widgetId===undefined)throw new Error('Verification unavailable');
      }
      configured=true;showStatus('');
    }catch{
      retry.hidden=false;
      showStatus('The enquiry form is temporarily unavailable. Try form again or email hello@cosmonet.ai.',true);
      if(!verification.hidden)verificationStatus.textContent='Verification could not load. Select “Try form again” or email hello@cosmonet.ai.';
    }finally{
      clearTimeout(timer);initializing=false;updateButton();
    }
  };
  const retryDelay=header=>{
    const seconds=header&&header.trim()?Number(header):NaN;
    const milliseconds=Number.isFinite(seconds)?seconds*1000:header?Date.parse(header)-Date.now():NaN;
    return Number.isFinite(milliseconds)?Math.min(300000,Math.max(1000,milliseconds)):60000;
  };
  email.addEventListener('blur',validateEmail);email.addEventListener('invalid',validateEmail);
  form.addEventListener('input',event=>{
    const field=event.target,hadError=field.getAttribute('aria-invalid')==='true';
    clearServerError(field);if(field===email&&hadError)validateEmail();
  });
  form.addEventListener('change',event=>clearServerError(event.target));
  form.addEventListener('reset',event=>{
    if(submitting){event.preventDefault();return}
    [...serverErrors.keys()].forEach(clearServerError);
    email.removeAttribute('aria-invalid');emailError.hidden=true;emailError.textContent='';
    requestId=makeRequestId();lastPayload=null;uncertainCommit=false;approvedPayload=null;forceNewEnquiry=false;
    changedNotice.hidden=true;showStatus('');resetVerification();
  });
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(submitting||!form.reportValidity())return;
    if(!configured||initializing){showStatus('The enquiry form is temporarily unavailable. Try form again or email hello@cosmonet.ai.',true,true);return}
    if(cooldownUntil>Date.now()){showStatus('Please wait before trying again. Your entered details are still here.',true,true);return}
    const data=getPayload(),payload=JSON.stringify(data),changed=lastPayload!==null&&lastPayload!==payload;
    if((forceNewEnquiry||(changed&&uncertainCommit))&&approvedPayload!==payload){confirmChangedEnquiry(forceNewEnquiry);return}
    if(turnstileRequired&&!token){showStatus('Complete the verification before sending your enquiry.',true,true);return}
    if(changed||forceNewEnquiry){requestId=makeRequestId();uncertainCommit=false;forceNewEnquiry=false}
    lastPayload=payload;approvedPayload=null;changedNotice.hidden=true;
    data.request_id=requestId;data.turnstile_token=token;
    token='';submitting=true;showStatus('');updateButton();
    const fields=$$('input,select,textarea',form),disabled=fields.map(field=>field.disabled);
    fields.forEach(field=>field.disabled=true);
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const response=await fetch('/api/leads',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(data),signal:controller.signal,mode:'same-origin',redirect:'error'});
      if(response.status===429){
        cooldownUntil=Date.now()+retryDelay(response.headers.get('Retry-After'));
        showStatus('Too many attempts. Please wait before trying again, or email hello@cosmonet.ai. Your entered details are still here.',true,true);return;
      }
      const result=response.status<500?await readJson(response):null;
      if(!response.ok||result?.ok!==true||result?.queued!==true||typeof result.reference!=='string'||!result.reference.trim()){
        uncertainCommit=uncertainCommit||response.status>=500||(response.ok&&result?.ok!==false);
        const first=showFieldErrors(result?.fieldErrors);
        const formError=typeof result?.fieldErrors?.form==='string'?result.fieldErrors.form.slice(0,300):'';
        let message='We could not confirm receipt of your enquiry. Retry without changing your details, or email hello@cosmonet.ai.';
        if(response.status===400||response.status===422)message=first?'Please check the highlighted details and complete verification again before retrying.':formError||'We could not accept your enquiry. Check your details, complete verification again, or email hello@cosmonet.ai.';
        else if(response.status===403)message='Your request could not be verified. Complete verification again, or email hello@cosmonet.ai.';
        else if(response.status===409){message='This enquiry request was already used for different details. You can send these details as a new enquiry.';forceNewEnquiry=true}
        else if(response.status===503)message='The enquiry service is temporarily unavailable. Retry without changing your details, or email hello@cosmonet.ai.';
        else if(response.status>=500)message='We could not confirm receipt because the enquiry service returned an error. Retry without changing your details, or email hello@cosmonet.ai.';
        showStatus(message,true,!first);
        if(first){fields.forEach((field,index)=>field.disabled=disabled[index]);first.focus()}
        if(forceNewEnquiry)confirmChangedEnquiry(true);
        return;
      }
      uncertainCommit=false;
      $('.reference',success).textContent='Your reference: '+result.reference.slice(0,100);
      form.hidden=true;success.hidden=false;success.focus();
    }catch(err){
      uncertainCommit=true;
      showStatus(err.name==='AbortError'?'The connection took too long. Your enquiry may already have been received. Retry without changing your details to check the same enquiry, or email hello@cosmonet.ai.':'We could not confirm receipt of your enquiry. Retry without changing your details to check the same enquiry, or email hello@cosmonet.ai.',true,true);
    }finally{
      clearTimeout(timer);fields.forEach((field,index)=>field.disabled=disabled[index]);
      submitting=false;resetVerification();
    }
  });
  sendChanged.addEventListener('click',()=>{
    if(submitting||!form.reportValidity())return;
    approvedPayload=JSON.stringify(getPayload());form.requestSubmit();
  });
  $('#new-enquiry')?.addEventListener('click',()=>{success.hidden=true;form.hidden=false;form.reset();$('#name').focus()});
  retry.addEventListener('click',initializeForm);initializeForm();
}

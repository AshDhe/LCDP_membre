/* Consultation des CGV publiées : session membre exigée par le Worker. */
(() => {
  'use strict';
  const cfg=window.SITE_CONFIG||{};
  const API=String(cfg.workerEditingAdminUrl||cfg.WORKER_EDITING_ADMIN_URL||'https://editing-admin-api.lacleduparc.fr').replace(/\/+$/,'');
  const status=document.getElementById('lcdp-cgv-status');
  const contenu=document.getElementById('lcdp-cgv-contenu');
  const date=document.getElementById('lcdp-cgv-date');
  const autorises=new Set(['P','BR','STRONG','EM','UL','OL','LI','A']);
  function nettoyerHtml(html){
    const tpl=document.createElement('template');tpl.innerHTML=String(html||'');
    tpl.content.querySelectorAll('script,style,iframe,object,embed,svg,math,form,input,button,textarea,select,template')
      .forEach(n=>n.remove());
    [...tpl.content.querySelectorAll('*')].reverse().forEach(n=>{
      if(!autorises.has(n.tagName)){n.replaceWith(...n.childNodes);return;}
      [...n.attributes].forEach(attr=>{
        if(n.tagName==='A'&&attr.name.toLowerCase()==='href'){
          const h=attr.value.trim();
          const compact=h.replace(/[\x00-\x20\x7f]/g,'').toLowerCase();
          if(h.startsWith('//')||!/^(https:\/\/|mailto:|tel:|\/(?!\/)|#|\.\/|\.\.\/)/.test(compact))n.removeAttribute(attr.name);
        }else n.removeAttribute(attr.name);
      });
      if(n.tagName==='A'&&n.hasAttribute('href'))n.setAttribute('rel','noopener noreferrer');
    });
    return tpl.innerHTML;
  }
  function message(s){status.textContent=s;status.hidden=false;contenu.hidden=true;}
  async function charger(){
    try{
      const res=await fetch(API+'/membre/cgv',{credentials:'include',cache:'no-store',headers:{Accept:'application/json'}});
      const data=await res.json().catch(()=>null);
      if(!res.ok || data?.success!==true){
        if(res.status===401){
          message('Connectez-vous à votre compte membre pour consulter les CGV.');
          const a=document.createElement('a');a.className='lcdp-cgv-connexion';a.href='/ESPACE-PUBLIC/connexion-membre.html';a.textContent='Se connecter';status.append(document.createElement('br'),a);
        } else message(data?.message||'CGV indisponibles.');
        return;
      }
      if(!Array.isArray(data.blocs)||!data.blocs.length){message('CGV non publiées.');return;}
      const fragment=document.createDocumentFragment();
      for(const bloc of data.blocs){
        const section=document.createElement('section');section.className='lcdp-cgv-section';
        const title=document.createElement('h2');title.textContent=String(bloc.titre||'');
        const body=document.createElement('div');body.className='lcdp-cgv-section__texte';body.innerHTML=nettoyerHtml(bloc.html);
        section.append(title,body);fragment.append(section);
      }
      contenu.replaceChildren(fragment);status.hidden=true;contenu.hidden=false;
      if(data.datepublication){const d=new Date(data.datepublication);if(!isNaN(d.valueOf())){date.textContent='Version publiée le '+new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',day:'numeric',month:'long',year:'numeric'}).format(d);date.hidden=false;}}
    }catch(e){message('Impossible de charger les CGV.');}
  }
  charger();
})();

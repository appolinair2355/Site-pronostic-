// ═══════════════════════════════════════════════════════════════
// PRONOSAI PRO — clients.js (Frontend JavaScript)
// ═══════════════════════════════════════════════════════════════

const API_URL = window.location.origin;

let currentUser = null;
let token = localStorage.getItem('token');
let allMatches = [];
let selectedMatches = new Set();
let adminMatches = [];
let adminSelectedMatches = new Set();

// ── Utilitaires ────────────────────────────────────────────────
function $(id){ return document.getElementById(id); }
function toast(msg, type='ok'){
  const z = $('toast-zone');
  const t = document.createElement('div');
  t.className = 'toast toast-'+type;
  t.textContent = msg;
  z.appendChild(t);
  setTimeout(()=>t.remove(),4000);
}
function fmtDate(d){ return new Date(d).toLocaleDateString('fr-FR'); }

// ── Auth ───────────────────────────────────────────────────────
async function doConnexion(){
  const btn = $('btnConn'); btn.disabled = true;
  const r = await fetch(`${API_URL}/auth/login`,{
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({username:$('connUser').value, password:$('connPass').value})
  });
  const d = await r.json();
  btn.disabled = false;
  if(!d.success){ $('msgConn').className='auth-msg err'; $('msgConn').textContent=d.error; return; }
  token = d.token; localStorage.setItem('token',token); currentUser=d.user;
  initSession();
}
async function doInscription(){
  const btn = $('btnInsc'); btn.disabled = true;
  const r = await fetch(`${API_URL}/auth/register`,{
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({username:$('inscUser').value, password:$('inscPass').value})
  });
  const d = await r.json();
  btn.disabled = false;
  if(!d.success){ $('msgInsc').className='auth-msg err'; $('msgInsc').textContent=d.error; return; }
  $('msgInsc').className='auth-msg ok'; $('msgInsc').textContent='Compte créé ! En attente de confirmation admin.';
}
function deconnexion(){ localStorage.removeItem('token'); location.reload(); }

function switchTab(t){
  $('tabConn').className = t==='conn'?'auth-tab active':'auth-tab';
  $('tabInsc').className = t==='insc'?'auth-tab active':'auth-tab';
  $('formConn').style.display = t==='conn'?'block':'none';
  $('formInsc').style.display = t==='insc'?'block':'none';
}

// ── Session ────────────────────────────────────────────────────
async function initSession(){
  if(!token) return showPage('pageAuth');
  try{
    const r = await fetch(`${API_URL}/auth/me`,{headers:{'Authorization':'Bearer '+token}});
    if(!r.ok) throw new Error();
    currentUser = await r.json();
  }catch{ localStorage.removeItem('token'); return showPage('pageAuth'); }

  $('userBar').style.display = 'flex';
  const badge = currentUser.is_admin ? 'badge-admin' : 'badge-user';
  const txt = currentUser.is_admin ? '👑 Admin' : '👤 '+currentUser.username;
  $('userBadgeEl').innerHTML = `<span class="badge ${badge}">${txt}</span>`;

  if(!currentUser.is_confirmed && !currentUser.is_admin){
    showPage('pageAttente');
  } else if(currentUser.is_admin){
    showPage('pageAdmin');
    loadAdminUsers(); loadAdminPronos(); loadConfig();
    // Init dates admin
    const today = new Date().toISOString().split('T')[0];
    if($('aDateDebut')) $('aDateDebut').value = today;
    if($('aDateFin')) $('aDateFin').value = today;
  } else {
    showPage('pageUser');
    loadMesPronos();
    const today = new Date().toISOString().split('T')[0];
    if($('dateDebut')) $('dateDebut').value = today;
    if($('dateFin')) $('dateFin').value = today;
  }
  loadStats();
}
function showPage(id){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('show'));
  $(id).classList.add('show');
}

// ── Stats publiques ────────────────────────────────────────────
async function loadStats(){
  try{
    const r = await fetch(`${API_URL}/config`);
    const d = await r.json();
    $('ctrUsers').textContent = (d.displayedUsers||0).toLocaleString();
    $('ctrMatchs').textContent = (d.stats?.matchsAnalyses||0).toLocaleString();
    $('ctrTaux').textContent = (d.stats?.tauxReussite||0)+'%';
  }catch{}
}

// ── Navigation utilisateur ─────────────────────────────────────
function showUserTab(id){
  document.querySelectorAll('#navUser .ntab').forEach((t,i)=>{
    t.className = (i===(['tCreate','tMesPronos','tParams'].indexOf(id)))?'ntab active':'ntab';
  });
  document.querySelectorAll('#pageUser .inner-page').forEach(p=>p.classList.remove('show'));
  $(id).classList.add('show');
}

// ── Navigation admin ───────────────────────────────────────────
function showAdminTab(id){
  const tabs = ['aCreate','aUsers','aPronos','aMatchs','aVerif','aConfig','aIA'];
  document.querySelectorAll('#navAdmin .ntab').forEach((t,i)=>{
    if(i < tabs.length){
      t.className = (i===tabs.indexOf(id))?'ntab active':'ntab';
    }
    if(i===7) t.className='ntab zip';
  });
  document.querySelectorAll('#pageAdmin .inner-page').forEach(p=>p.classList.remove('show'));
  $(id).classList.add('show');
  if(id==='aPronos') loadAdminPronos();
  if(id==='aVerif') loadAdminVerif();
  if(id==='aConfig') loadConfig();
  if(id==='aIA') adminLoadIASettings();
}

// ── Marchés utilisateur ──────────────────────────────────────
document.querySelectorAll('#marchesRow .mchip').forEach(chip=>{
  chip.addEventListener('click',()=>{ chip.classList.toggle('on'); });
});
function getMarchesActifs(){
  return [...document.querySelectorAll('#marchesRow .mchip.on')].map(c=>c.dataset.m);
}

// ── Marchés admin ────────────────────────────────────────────
document.querySelectorAll('#aMarchesRow .mchip').forEach(chip=>{
  chip.addEventListener('click',()=>{ chip.classList.toggle('on'); });
});
function getAdminMarchesActifs(){
  return [...document.querySelectorAll('#aMarchesRow .mchip.on')].map(c=>c.dataset.m);
}

// ═══════════════════════════════════════════════════════════════
// UTILISATEUR : Génération de pronostic
// ═══════════════════════════════════════════════════════════════

async function genererTout(){
  const debut = $('dateDebut').value;
  const fin = $('dateFin').value || debut;
  const cote = parseFloat($('coteCible').value)||3.0;
  const marches = getMarchesActifs();
  if(!debut){ toast('Veuillez choisir une date','err'); return; }
  if(marches.length===0){ toast('Sélectionnez au moins un marché','err'); return; }

  $('secFormulaire').style.display='none';
  $('secProg').style.display='block';
  $('progLabel').textContent='Récupération des matchs en cours…';
  $('progFill').style.width='30%';

  try{
    const r = await fetch(`${API_URL}/matches?startDate=${debut}&endDate=${fin}`,{
      headers:{'Authorization':'Bearer '+token}
    });
    if(!r.ok){ const e=await r.json(); throw new Error(e.error||'Erreur'); }
    const d = await r.json();
    allMatches = d.matches||[];
    $('progFill').style.width='60%';
    $('progLabel').textContent=`${allMatches.length} matchs trouvés — Génération du combiné…`;

    if(allMatches.length===0){
      $('secProg').style.display='none';
      $('secFormulaire').style.display='block';
      toast('Aucun match trouvé pour cette période','err');
      return;
    }
    await creerPronostic(allMatches, debut, fin, cote, marches);
  }catch(e){
    $('secProg').style.display='none';
    $('secFormulaire').style.display='block';
    toast(e.message||'Erreur réseau','err');
  }
}

async function creerPronostic(matchs, debut, fin, cote, marches){
  $('progLabel').textContent='Analyse IA en cours…';
  $('progFill').style.width='85%';

  const cleIA = localStorage.getItem('cleIA')||'';
  const fournisseur = localStorage.getItem('fournisseurIA')||'groq';

  try{
    const r = await fetch(`${API_URL}/pronostics`,{
      method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
      body:JSON.stringify({
        matchsSelectionnes: matchs,
        startDate: debut, endDate: fin,
        coteCible: cote,
        marchesSelectionnes: marches,
        cleIA: cleIA,
        fournisseurIA: fournisseur
      })
    });
    const d = await r.json();
    $('secProg').style.display='none';
    if(!d.success){
      $('secFormulaire').style.display='block';
      toast(d.message||'Erreur','err');
      return;
    }
    afficherResultat(d.data);
  }catch(e){
    $('secProg').style.display='none';
    $('secFormulaire').style.display='block';
    toast('Erreur lors de la création','err');
  }
}

function afficherResultat(data){
  $('secResult').style.display='block';
  $('resCote').textContent = data.coteTotal+'x';
  $('resConf').textContent = data.confiance+'%';
  $('confFill').style.width = data.confiance+'%';
  $('resIA').textContent = data.analyseIA||'Aucune analyse disponible';

  const container = $('resSels');
  container.innerHTML = '';
  data.selections.forEach(s=>{
    container.innerHTML += `
      <div class="sel-item">
        <div class="sel-match">${s.match}</div>
        <div class="sel-comp">${s.competition||''} · ${fmtDate(s.date)}</div>
        <div class="sel-choix">${s.marche} → ${s.selection} <span class="cote-pill">${s.cote}x</span></div>
      </div>`;
  });

  loadMesPronos();
}

function resetCreation(){
  $('secResult').style.display='none';
  $('secMatchs').style.display='none';
  $('secFormulaire').style.display='block';
  $('progFill').style.width='0%';
}

// ── Sélection manuelle utilisateur ────────────────────────────
async function chargerMatchsSeulement(){
  const debut = $('dateDebut').value;
  const fin = $('dateFin').value || debut;
  if(!debut){ toast('Choisissez une date','err'); return; }

  $('secFormulaire').style.display='none';
  $('secProg').style.display='block';
  $('progLabel').textContent='Chargement des matchs…';
  $('progFill').style.width='40%';

  try{
    const r = await fetch(`${API_URL}/matches?startDate=${debut}&endDate=${fin}`,{
      headers:{'Authorization':'Bearer '+token}
    });
    const d = await r.json();
    allMatches = d.matches||[];
    $('secProg').style.display='none';
    $('secMatchs').style.display='block';
    renderMatchsGrid();
  }catch(e){
    $('secProg').style.display='none';
    $('secFormulaire').style.display='block';
    toast('Erreur de chargement','err');
  }
}

function renderMatchsGrid(){
  const grid = $('matchsGrid');
  grid.innerHTML = '';
  selectedMatches = new Set(allMatches.map((_,i)=>i));
  updateSelCount();

  allMatches.forEach((m,i)=>{
    const card = document.createElement('div');
    card.className = 'mcard on';
    card.innerHTML = `
      <div class="mcard-check">✓</div>
      <div class="mcard-comp">${m.competition||''}</div>
      <div class="mcard-teams">${m.equipe_domicile} — ${m.equipe_exterieur}</div>
      <div class="mcard-date">${fmtDate(m.date)} ${m.heure?new Date(m.heure).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):''}</div>
    `;
    card.onclick = ()=>{
      if(selectedMatches.has(i)){
        selectedMatches.delete(i);
        card.className = 'mcard off';
        card.querySelector('.mcard-check').textContent = '';
      } else {
        selectedMatches.add(i);
        card.className = 'mcard on';
        card.querySelector('.mcard-check').textContent = '✓';
      }
      updateSelCount();
    };
    grid.appendChild(card);
  });
}

function updateSelCount(){
  $('selCount').textContent = selectedMatches.size+' sélectionné'+(selectedMatches.size>1?'s':'');
}

async function genererDepuisSelection(){
  if(selectedMatches.size < 2){ toast('Sélectionnez au moins 2 matchs','err'); return; }
  const matchs = allMatches.filter((_,i)=>selectedMatches.has(i));
  const debut = $('dateDebut').value;
  const fin = $('dateFin').value || debut;
  const cote = parseFloat($('coteCible').value)||3.0;
  const marches = getMarchesActifs();

  $('secMatchs').style.display='none';
  $('secProg').style.display='block';
  await creerPronostic(matchs, debut, fin, cote, marches);
}

// ═══════════════════════════════════════════════════════════════
// ADMIN : Génération de pronostic
// ═══════════════════════════════════════════════════════════════

async function adminGenererTout(){
  const debut = $('aDateDebut').value;
  const fin = $('aDateFin').value || debut;
  const cote = parseFloat($('aCoteCible').value)||3.0;
  const marches = getAdminMarchesActifs();
  if(!debut){ toast('Veuillez choisir une date','err'); return; }
  if(marches.length===0){ toast('Sélectionnez au moins un marché','err'); return; }

  $('aSecFormulaire').style.display='none';
  $('aSecProg').style.display='block';
  $('aProgLabel').textContent='Récupération des matchs en cours…';
  $('aProgFill').style.width='30%';

  try{
    const r = await fetch(`${API_URL}/matches?startDate=${debut}&endDate=${fin}`,{
      headers:{'Authorization':'Bearer '+token}
    });
    if(!r.ok){ const e=await r.json(); throw new Error(e.error||'Erreur'); }
    const d = await r.json();
    adminMatches = d.matches||[];
    $('aProgFill').style.width='60%';
    $('aProgLabel').textContent=`${adminMatches.length} matchs trouvés — Génération du combiné…`;

    if(adminMatches.length===0){
      $('aSecProg').style.display='none';
      $('aSecFormulaire').style.display='block';
      toast('Aucun match trouvé pour cette période','err');
      return;
    }
    await adminCreerPronostic(adminMatches, debut, fin, cote, marches);
  }catch(e){
    $('aSecProg').style.display='none';
    $('aSecFormulaire').style.display='block';
    toast(e.message||'Erreur réseau','err');
  }
}

async function adminCreerPronostic(matchs, debut, fin, cote, marches){
  $('aProgLabel').textContent='Analyse IA en cours…';
  $('aProgFill').style.width='85%';

  const cleIA = localStorage.getItem('cleIA')||'';
  const fournisseur = localStorage.getItem('fournisseurIA')||'groq';

  try{
    const r = await fetch(`${API_URL}/pronostics`,{
      method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
      body:JSON.stringify({
        matchsSelectionnes: matchs,
        startDate: debut, endDate: fin,
        coteCible: cote,
        marchesSelectionnes: marches,
        cleIA: cleIA,
        fournisseurIA: fournisseur
      })
    });
    const d = await r.json();
    $('aSecProg').style.display='none';
    if(!d.success){
      $('aSecFormulaire').style.display='block';
      toast(d.message||'Erreur','err');
      return;
    }
    adminAfficherResultat(d.data);
  }catch(e){
    $('aSecProg').style.display='none';
    $('aSecFormulaire').style.display='block';
    toast('Erreur lors de la création','err');
  }
}

function adminAfficherResultat(data){
  $('aSecResult').style.display='block';
  $('aResCote').textContent = data.coteTotal+'x';
  $('aResConf').textContent = data.confiance+'%';
  $('aConfFill').style.width = data.confiance+'%';
  $('aResIA').textContent = data.analyseIA||'Aucune analyse disponible';

  const container = $('aResSels');
  container.innerHTML = '';
  data.selections.forEach(s=>{
    container.innerHTML += `
      <div class="sel-item">
        <div class="sel-match">${s.match}</div>
        <div class="sel-comp">${s.competition||''} · ${fmtDate(s.date)}</div>
        <div class="sel-choix">${s.marche} → ${s.selection} <span class="cote-pill">${s.cote}x</span></div>
      </div>`;
  });

  loadAdminPronos();
}

function adminResetCreation(){
  $('aSecResult').style.display='none';
  $('aSecMatchs').style.display='none';
  $('aSecFormulaire').style.display='block';
  $('aProgFill').style.width='0%';
}

// ── Sélection manuelle admin ───────────────────────────────────
async function adminChargerMatchsSeulement(){
  const debut = $('aDateDebut').value;
  const fin = $('aDateFin').value || debut;
  if(!debut){ toast('Choisissez une date','err'); return; }

  $('aSecFormulaire').style.display='none';
  $('aSecProg').style.display='block';
  $('aProgLabel').textContent='Chargement des matchs…';
  $('aProgFill').style.width='40%';

  try{
    const r = await fetch(`${API_URL}/matches?startDate=${debut}&endDate=${fin}`,{
      headers:{'Authorization':'Bearer '+token}
    });
    const d = await r.json();
    adminMatches = d.matches||[];
    $('aSecProg').style.display='none';
    $('aSecMatchs').style.display='block';
    adminRenderMatchsGrid();
  }catch(e){
    $('aSecProg').style.display='none';
    $('aSecFormulaire').style.display='block';
    toast('Erreur de chargement','err');
  }
}

function adminRenderMatchsGrid(){
  const grid = $('aMatchsGrid');
  grid.innerHTML = '';
  adminSelectedMatches = new Set(adminMatches.map((_,i)=>i));
  adminUpdateSelCount();

  adminMatches.forEach((m,i)=>{
    const card = document.createElement('div');
    card.className = 'mcard on';
    card.innerHTML = `
      <div class="mcard-check">✓</div>
      <div class="mcard-comp">${m.competition||''}</div>
      <div class="mcard-teams">${m.equipe_domicile} — ${m.equipe_exterieur}</div>
      <div class="mcard-date">${fmtDate(m.date)} ${m.heure?new Date(m.heure).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):''}</div>
    `;
    card.onclick = ()=>{
      if(adminSelectedMatches.has(i)){
        adminSelectedMatches.delete(i);
        card.className = 'mcard off';
        card.querySelector('.mcard-check').textContent = '';
      } else {
        adminSelectedMatches.add(i);
        card.className = 'mcard on';
        card.querySelector('.mcard-check').textContent = '✓';
      }
      adminUpdateSelCount();
    };
    grid.appendChild(card);
  });
}

function adminUpdateSelCount(){
  $('aSelCount').textContent = adminSelectedMatches.size+' sélectionné'+(adminSelectedMatches.size>1?'s':'');
}

async function adminGenererDepuisSelection(){
  if(adminSelectedMatches.size < 2){ toast('Sélectionnez au moins 2 matchs','err'); return; }
  const matchs = adminMatches.filter((_,i)=>adminSelectedMatches.has(i));
  const debut = $('aDateDebut').value;
  const fin = $('aDateFin').value || debut;
  const cote = parseFloat($('aCoteCible').value)||3.0;
  const marches = getAdminMarchesActifs();

  $('aSecMatchs').style.display='none';
  $('aSecProg').style.display='block';
  await adminCreerPronostic(matchs, debut, fin, cote, marches);
}

// ═══════════════════════════════════════════════════════════════
// MES PRONOSTICS
// ═══════════════════════════════════════════════════════════════

async function loadMesPronos(){
  try{
    const r = await fetch(`${API_URL}/pronostics`,{headers:{'Authorization':'Bearer '+token}});
    const d = await r.json();
    const container = $('mesPronos');
    const list = d.pronostics||[];
    if(list.length===0){ container.innerHTML='<div class="empty">Aucun pronostic généré</div>'; return; }
    container.innerHTML = list.map(p=>`
      <div class="pcard">
        <div class="pcard-head">
          <div>
            <div style="font-weight:700;">Combiné · ${p.coteTotal}x</div>
            <div class="pcard-meta">${fmtDate(p.startDate)} → ${fmtDate(p.endDate)} · ${p.selections.length} sélections</div>
          </div>
          <div class="pcard-cote">${p.coteTotal}x</div>
        </div>
        <div style="font-size:.8rem;opacity:.6;margin-bottom:8px;">
          ${p.selections.map(s=>`• ${s.match}: ${s.selection}`).join('<br>')}
        </div>
        <span class="pill ${p.statut_verification==='verifie'?'pill-ver':p.statut_verification==='perdu'?'pill-per':'pill-att'}">
          ${p.statut_verification==='verifie'?'✅ Vérifié':p.statut_verification==='perdu'?'❌ Perdu':'⏳ En attente'}
        </span>
      </div>
    `).join('');
  }catch{}
}

// ═══════════════════════════════════════════════════════════════
// PARAMÈTRES UTILISATEUR
// ═══════════════════════════════════════════════════════════════

function showParamTab(id){
  const tabs = ['pMatchs','pVerif','pIA'];
  document.querySelectorAll('#tParams .ntab').forEach((t,i)=>{
    t.className = (i===tabs.indexOf(id))?'ntab active':'ntab';
  });
  document.querySelectorAll('#tParams .inner-page').forEach(p=>p.classList.remove('show'));
  $(id).classList.add('show');

  if(id==='pIA'){
    $('iaFournisseur').value = getFournisseurIA();
    $('iaCle').value = getCleIA();
  }
}

async function chargerParamMatchs(){
  const d=$('pmDate').value;
  if(!d){toast('Date requise','err');return;}
  try{
    const r=await fetch(`${API_URL}/matches?startDate=${d}&endDate=${d}`,{headers:{'Authorization':'Bearer '+token}});
    const data=await r.json();
    const container=$('pmList');
    if((data.matches||[]).length===0){container.innerHTML='<div class="empty">Aucun match</div>';return;}
    container.innerHTML=data.matches.map(m=>`
      <div style="padding:10px 0;border-bottom:1px solid var(--border);">
        <strong>${m.equipe_domicile} — ${m.equipe_exterieur}</strong>
        <div style="font-size:.78rem;opacity:.5;">${m.competition||''} · ${fmtDate(m.date)}</div>
      </div>
    `).join('');
  }catch{toast('Erreur','err');}
}

// ── Gestion Clé IA Utilisateur ─────────────────────────────────
function getCleIA(){ return localStorage.getItem('cleIA')||''; }
function setCleIA(cle){ localStorage.setItem('cleIA',cle); }
function getFournisseurIA(){ return localStorage.getItem('fournisseurIA')||'groq'; }
function setFournisseurIA(f){ localStorage.setItem('fournisseurIA',f); }

function sauverCleIA(){
  setFournisseurIA($('iaFournisseur').value);
  setCleIA($('iaCle').value);
  $('iaMsg').className='auth-msg ok'; $('iaMsg').textContent='Clé IA sauvegardée localement !';
  toast('Clé IA sauvegardée');
}

async function testerCleIA(){
  const cle = $('iaCle').value;
  const fournisseur = $('iaFournisseur').value;
  if(!cle){ $('iaMsg').className='auth-msg err'; $('iaMsg').textContent='Entrez une clé d'abord'; return; }

  $('iaMsg').className='auth-msg'; $('iaMsg').textContent='Test en cours…';
  try{
    const url = fournisseur==='groq'?'https://api.groq.com/openai/v1/models':'https://api.openai.com/v1/models';
    const r = await fetch(url,{headers:{'Authorization':'Bearer '+cle}});
    if(r.ok){
      $('iaMsg').className='auth-msg ok'; $('iaMsg').textContent='✅ Clé valide ! Connexion réussie.';
      sauverCleIA();
    } else {
      const e = await r.json();
      $('iaMsg').className='auth-msg err'; $('iaMsg').textContent='❌ Clé invalide : '+(e.error?.message||'Erreur inconnue');
    }
  }catch(e){
    $('iaMsg').className='auth-msg err'; $('iaMsg').textContent='❌ Erreur réseau : '+e.message;
  }
}

// ═══════════════════════════════════════════════════════════════
// ADMIN : Utilisateurs
// ═══════════════════════════════════════════════════════════════

async function loadAdminUsers(){
  try{
    const r = await fetch(`${API_URL}/admin/users`,{headers:{'Authorization':'Bearer '+token}});
    const d = await r.json();
    const container = $('adminUsers');
    const users = d.users||[];
    if(users.length===0){ container.innerHTML='<div class="empty">Aucun utilisateur</div>'; return; }
    container.innerHTML = `
      <table class="dtable">
        <tr><th>ID</th><th>Identifiant</th><th>Admin</th><th>Confirmé</th><th>Actions</th></tr>
        ${users.map(u=>`
          <tr>
            <td>${u.id.slice(0,12)}…</td>
            <td><strong>${u.username}</strong></td>
            <td>${u.is_admin?'👑 Oui':'Non'}</td>
            <td>${u.is_confirmed?'✅':'⏳'}</td>
            <td>
              ${!u.is_confirmed&&!u.is_admin?`<button class="bsm b-conf" onclick="confirmerUser('${u.id}')">✓ Confirmer</button>`:''}
              ${!u.is_admin?`<button class="bsm b-del" onclick="supprimerUser('${u.id}')">🗑 Supprimer</button>`:''}
            </td>
          </tr>
        `).join('')}
      </table>`;
  }catch(e){ toast('Erreur chargement users','err'); }
}
async function confirmerUser(id){
  await fetch(`${API_URL}/admin/users/${id}/confirm`,{method:'POST',headers:{'Authorization':'Bearer '+token}});
  loadAdminUsers(); toast('Utilisateur confirmé');
}
async function supprimerUser(id){
  if(!confirm('Supprimer cet utilisateur ?')) return;
  await fetch(`${API_URL}/admin/users/${id}`,{method:'DELETE',headers:{'Authorization':'Bearer '+token}});
  loadAdminUsers(); toast('Utilisateur supprimé');
}

// ═══════════════════════════════════════════════════════════════
// ADMIN : Pronostics
// ═══════════════════════════════════════════════════════════════

async function loadAdminPronos(){
  try{
    const r = await fetch(`${API_URL}/admin/pronostics`,{headers:{'Authorization':'Bearer '+token}});
    const d = await r.json();
    const list = d.pronostics||[];
    $('pronoBadge').textContent = list.length;
    const container = $('adminPronos');
    if(list.length===0){ container.innerHTML='<div class="empty">Aucun pronostic</div>'; return; }
    container.innerHTML = list.map(p=>`
      <div class="pcard">
        <div class="pcard-head">
          <div>
            <div style="font-weight:700;">${p.username} · ${p.coteTotal}x</div>
            <div class="pcard-meta">${fmtDate(p.startDate)} · ${p.selections.length} sélections</div>
          </div>
          <div style="display:flex;gap:6px;">
            <button class="bsm b-ver" onclick="verifierProno('${p.id}','verifie')">✓ Gagné</button>
            <button class="bsm b-del" onclick="verifierProno('${p.id}','perdu')">✗ Perdu</button>
            <button class="bsm b-del" onclick="supprimerProno('${p.id}')">🗑</button>
          </div>
        </div>
        <div style="font-size:.8rem;opacity:.6;">
          ${p.selections.map(s=>`• ${s.match}: ${s.selection} (${s.cote}x)`).join('<br>')}
        </div>
        <span class="pill ${p.verified_status==='verifie'?'pill-ver':p.verified_status==='perdu'?'pill-per':'pill-att'}">
          ${p.verified_status==='verifie'?'✅ Vérifié':p.verified_status==='perdu'?'❌ Perdu':'⏳ En attente'}
        </span>
      </div>
    `).join('');
  }catch{}
}
async function verifierProno(id,status){
  await fetch(`${API_URL}/admin/pronostics/${id}/verify`,{
    method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
    body:JSON.stringify({status})
  });
  loadAdminPronos(); toast('Statut mis à jour');
}
async function supprimerProno(id){
  if(!confirm('Supprimer ce pronostic ?')) return;
  await fetch(`${API_URL}/admin/pronostics/${id}`,{method:'DELETE',headers:{'Authorization':'Bearer '+token}});
  loadAdminPronos(); toast('Pronostic supprimé');
}

// ═══════════════════════════════════════════════════════════════
// ADMIN : Matchs
// ═══════════════════════════════════════════════════════════════

async function chargerAdminMatchs(){
  const s=$('amStart').value, e=$('amEnd').value;
  if(!s){toast('Date requise','err');return;}
  $('amStats').textContent='Chargement…';
  try{
    const r=await fetch(`${API_URL}/matches?startDate=${s}&endDate=${e||s}`,{headers:{'Authorization':'Bearer '+token}});
    const d=await r.json();
    $('amStats').textContent=`${d.total||0} matchs · ${(d.dates||[]).join(', ')}`;
    const container=$('amTable');
    if((d.matches||[]).length===0){container.innerHTML='<div class="empty">Aucun match</div>';return;}
    container.innerHTML=`<table class="dtable">
      <tr><th>Compétition</th><th>Match</th><th>Date</th><th>Statut</th></tr>
      ${d.matches.map(m=>`<tr><td>${m.competition||''}</td><td><strong>${m.equipe_domicile} — ${m.equipe_exterieur}</strong></td><td>${fmtDate(m.date)}</td><td>${m.statut||''}</td></tr>`).join('')}
    </table>`;
  }catch{toast('Erreur','err');}
}

// ═══════════════════════════════════════════════════════════════
// ADMIN : Vérification
// ═══════════════════════════════════════════════════════════════

async function loadAdminVerif(){
  try{
    const r=await fetch(`${API_URL}/admin/pronostics`,{headers:{'Authorization':'Bearer '+token}});
    const d=await r.json();
    const list=d.pronostics||[];
    const container=$('avList');
    if(list.length===0){container.innerHTML='<div class="empty">Aucun pronostic à vérifier</div>';return;}
    container.innerHTML=list.map(p=>`
      <div class="pcard">
        <div style="font-weight:700;">${p.username} · ${p.coteTotal}x · ${fmtDate(p.startDate)}</div>
        <div style="font-size:.8rem;opacity:.6;margin:6px 0;">
          ${p.selections.map(s=>`• ${s.match}: ${s.selection}`).join('<br>')}
        </div>
        <div style="display:flex;gap:8px;">
          <button class="bsm b-ver" onclick="verifierProno('${p.id}','verifie')">✓ Gagné</button>
          <button class="bsm b-del" onclick="verifierProno('${p.id}','perdu')">✗ Perdu</button>
        </div>
      </div>
    `).join('');
  }catch{}
}

// ═══════════════════════════════════════════════════════════════
// ADMIN : Configuration
// ═══════════════════════════════════════════════════════════════

async function loadConfig(){
  try{
    const r=await fetch(`${API_URL}/config`);
    const d=await r.json();
    $('cfgGrid').innerHTML=`
      <div class="cfg-item"><div class="cfg-label">👤 Membres affichés</div><input class="cfg-input" id="cfgUsers" value="${d.displayedUsers||0}"></div>
      <div class="cfg-item"><div class="cfg-label">⚽ Matchs analysés</div><input class="cfg-input" id="cfgMatchs" value="${d.stats?.matchsAnalyses||0}"></div>
      <div class="cfg-item"><div class="cfg-label">🎯 Pronostics générés</div><input class="cfg-input" id="cfgPronos" value="${d.stats?.pronosticsGeneres||0}"></div>
      <div class="cfg-item"><div class="cfg-label">📊 Taux de réussite (%)</div><input class="cfg-input" id="cfgTaux" value="${d.stats?.tauxReussite||0}"></div>
    `;
    const real=d.realUsers||0;
    $('statsReelles').innerHTML=`<div class="infobox">👤 Utilisateurs réels inscrits : <strong>${real}</strong></div>`;
  }catch{}
}
async function sauvegarderConfig(){
  const body={
    displayedUsers:parseInt($('cfgUsers').value)||0,
    matchsAnalyses:parseInt($('cfgMatchs').value)||0,
    pronosticsGeneres:parseInt($('cfgPronos').value)||0,
    tauxReussite:parseInt($('cfgTaux').value)||0
  };
  try{
    await fetch(`${API_URL}/admin/config`,{
      method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
      body:JSON.stringify(body)
    });
    $('cfgMsg').className='auth-msg ok'; $('cfgMsg').textContent='Configuration sauvegardée !';
    loadStats();
  }catch{
    $('cfgMsg').className='auth-msg err'; $('cfgMsg').textContent='Erreur de sauvegarde';
  }
}

// ═══════════════════════════════════════════════════════════════
// ADMIN : Clé IA
// ═══════════════════════════════════════════════════════════════

function adminLoadIASettings(){
  $('aIaFournisseur').value = getFournisseurIA();
  $('aIaCle').value = getCleIA();
}

function adminSauverCleIA(){
  setFournisseurIA($('aIaFournisseur').value);
  setCleIA($('aIaCle').value);
  $('aIaMsg').className='auth-msg ok'; $('aIaMsg').textContent='Clé IA sauvegardée localement !';
  toast('Clé IA sauvegardée');
}

async function adminTesterCleIA(){
  const cle = $('aIaCle').value;
  const fournisseur = $('aIaFournisseur').value;
  if(!cle){ $('aIaMsg').className='auth-msg err'; $('aIaMsg').textContent='Entrez une clé d'abord'; return; }

  $('aIaMsg').className='auth-msg'; $('aIaMsg').textContent='Test en cours…';
  try{
    const url = fournisseur==='groq'?'https://api.groq.com/openai/v1/models':'https://api.openai.com/v1/models';
    const r = await fetch(url,{headers:{'Authorization':'Bearer '+cle}});
    if(r.ok){
      $('aIaMsg').className='auth-msg ok'; $('aIaMsg').textContent='✅ Clé valide ! Connexion réussie.';
      adminSauverCleIA();
    } else {
      const e = await r.json();
      $('aIaMsg').className='auth-msg err'; $('aIaMsg').textContent='❌ Clé invalide : '+(e.error?.message||'Erreur inconnue');
    }
  }catch(e){
    $('aIaMsg').className='auth-msg err'; $('aIaMsg').textContent='❌ Erreur réseau : '+e.message;
  }
}

// ═══════════════════════════════════════════════════════════════
// UTILITAIRES GLOBAUX
// ═══════════════════════════════════════════════════════════════

function telechargerZip(){
  window.open(`${API_URL}/admin/export-zip?token=${token}`);
}

// ── Démarrage ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', ()=>{
  const today = new Date().toISOString().split('T')[0];
  if($('dateDebut')) $('dateDebut').value = today;
  if($('dateFin')) $('dateFin').value = today;
  if($('pmDate')) $('pmDate').value = today;
  if($('amStart')) $('amStart').value = today;
  if($('aDateDebut')) $('aDateDebut').value = today;
  if($('aDateFin')) $('aDateFin').value = today;

  initSession();
});

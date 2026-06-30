// ══════════════════════════════════════════════════════
//  PRONOSAI PRO — clients.js (CORRIGÉ)
// ══════════════════════════════════════════════════════
let token = localStorage.getItem('pronosai_token') || null;
let moi = null;
let matchsRecuperes = [];
let matchsSelectionnes = new Set();

// ── Utilitaires ────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
}
function toast(msg, type = 'inf') {
  const zone = document.getElementById('toast-zone');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  zone.appendChild(el);
  setTimeout(() => el.remove(), 3400);
}
function api(url, opts = {}) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return fetch(url, { headers: h, ...opts }).then(async r => {
    const text = await r.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      console.error('Réponse non-JSON:', text.substring(0, 200));
      return { error: 'Erreur serveur — réponse invalide. Vérifiez que le serveur est en ligne.' };
    }
  });
}
function dateFr(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}
function pillStatut(s) {
  if (s === 'verifie' || s === 'verified')  return '<span class="pill pill-ver">✅ Vérifié — Gagné</span>';
  if (s === 'perdu'   || s === 'failed')    return '<span class="pill pill-per">❌ Perdu</span>';
  return '<span class="pill pill-att">⏳ En attente de vérification</span>';
}
function animCount(el, target, suffix = '') {
  const dur = 1800, step = 30, inc = target / (dur / step);
  let cur = 0;
  const iv = setInterval(() => {
    cur = Math.min(cur + inc, target);
    el.textContent = Math.floor(cur).toLocaleString('fr-FR') + suffix;
    if (cur >= target) clearInterval(iv);
  }, step);
}

// ── Pages ──────────────────────────────────────────────
function afficherPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('show'));
  document.getElementById(id)?.classList.add('show');
}

// ── Onglets utilisateur ─────────────────────────────────
function showUserTab(id) {
  ['tCreate','tMesPronos','tParams'].forEach(t => {
    document.getElementById(t)?.classList.remove('show');
  });
  document.getElementById(id)?.classList.add('show');
  document.querySelectorAll('#navUser .ntab').forEach((t, i) => {
    t.classList.toggle('active', ['tCreate','tMesPronos','tParams'][i] === id);
  });
  if (id === 'tMesPronos') chargerMesPronos();
  if (id === 'tParams') {
    const auj = new Date().toISOString().split('T')[0];
    document.getElementById('pmDate').value = auj;
    showParamTab('pMatchs');
    chargerVerifUser();
  }
}

// ── Onglets paramètres ────────────────────────────────
function showParamTab(id) {
  ['pMatchs','pVerif'].forEach(t => document.getElementById(t)?.classList.remove('show'));
  document.getElementById(id)?.classList.add('show');
  document.querySelectorAll('#tParams .nav .ntab').forEach((t, i) => {
    t.classList.toggle('active', i === (id === 'pMatchs' ? 0 : 1));
  });
}

// ── Onglets admin ──────────────────────────────────────
function showAdminTab(id) {
  ['aUsers','aPronos','aMatchs','aVerif','aConfig'].forEach(t => document.getElementById(t)?.classList.remove('show'));
  document.getElementById(id)?.classList.add('show');
  const ids = ['aUsers','aPronos','aMatchs','aVerif','aConfig'];
  document.querySelectorAll('#navAdmin .ntab:not(.zip)').forEach((t, i) => {
    t.classList.toggle('active', ids[i] === id);
  });
  if (id === 'aUsers')  chargerAdminUsers();
  if (id === 'aPronos') chargerAdminPronos();
  if (id === 'aVerif')  chargerAdminVerif();
  if (id === 'aConfig') chargerConfig();
}

// ── Marchés toggle ────────────────────────────────────
function initMarches() {
  document.querySelectorAll('.mchip').forEach(c =>
    c.addEventListener('click', () => c.classList.toggle('on'))
  );
}

// ── Stats landing ─────────────────────────────────────
async function chargerStats() {
  try {
    const data = await api('/config');
    animCount(document.getElementById('ctrUsers'),  data.displayedUsers || 1247, '+');
    animCount(document.getElementById('ctrMatchs'), data.stats?.matchsAnalyses || 8432, '');
    animCount(document.getElementById('ctrTaux'),   data.stats?.tauxReussite || 73, '%');
  } catch { /* silencieux */ }
}

// ── Auth ───────────────────────────────────────────────
function switchTab(t) {
  document.getElementById('tabConn').classList.toggle('active', t === 'conn');
  document.getElementById('tabInsc').classList.toggle('active', t === 'insc');
  document.getElementById('formConn').style.display = t === 'conn' ? 'block' : 'none';
  document.getElementById('formInsc').style.display = t === 'insc' ? 'block' : 'none';
}

async function doConnexion() {
  const user = document.getElementById('connUser').value.trim();
  const pass = document.getElementById('connPass').value;
  const msg  = document.getElementById('msgConn');
  msg.className = 'auth-msg';
  if (!user || !pass) { msg.className = 'auth-msg err'; msg.textContent = 'Remplissez tous les champs.'; return; }

  document.getElementById('btnConn').disabled = true;
  document.getElementById('btnConn').textContent = '⏳ Connexion…';
  const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ username: user, password: pass }) });
  document.getElementById('btnConn').disabled = false;
  document.getElementById('btnConn').textContent = '🔑 Se connecter';

  if (data.error) { msg.className = 'auth-msg err'; msg.textContent = data.error; return; }
  token = data.token;
  moi   = data.user;
  localStorage.setItem('pronosai_token', token);
  apresConnexion();
}

async function doInscription() {
  const user = document.getElementById('inscUser').value.trim();
  const pass = document.getElementById('inscPass').value;
  const msg  = document.getElementById('msgInsc');
  msg.className = 'auth-msg';
  if (!user || !pass) { msg.className = 'auth-msg err'; msg.textContent = 'Remplissez tous les champs.'; return; }

  document.getElementById('btnInsc').disabled = true;
  document.getElementById('btnInsc').textContent = '⏳ Création…';
  const data = await api('/auth/register', { method: 'POST', body: JSON.stringify({ username: user, password: pass }) });
  document.getElementById('btnInsc').disabled = false;
  document.getElementById('btnInsc').textContent = '📝 Créer mon compte';

  if (data.error) { msg.className = 'auth-msg err'; msg.textContent = data.error; return; }
  msg.className = 'auth-msg ok';
  msg.textContent = '✅ ' + data.message;
  setTimeout(() => switchTab('conn'), 2200);
}

function deconnexion() {
  token = null; moi = null;
  localStorage.removeItem('pronosai_token');
  document.getElementById('userBar').style.display = 'none';
  afficherPage('pageAuth');
  chargerStats();
}

function apresConnexion() {
  const bar = document.getElementById('userBar');
  bar.style.display = 'flex';
  const badge = document.getElementById('userBadgeEl');
  if (moi?.is_admin) {
    badge.innerHTML = `<span class="badge badge-admin">👑 ${esc(moi.username)} — Administrateur</span>`;
    afficherPage('pageAdmin');
    chargerAdminUsers();
  } else if (!moi?.is_confirmed) {
    afficherPage('pageAttente');
  } else {
    badge.innerHTML = `<span class="badge badge-user">👤 ${esc(moi.username)}</span>`;
    afficherPage('pageUser');
    showUserTab('tCreate');
    resetCreation();
    const auj = new Date().toISOString().split('T')[0];
    document.getElementById('dateDebut').value = auj;
    document.getElementById('dateFin').value   = auj;
  }
}

async function restaurerSession() {
  if (!token) return;
  const data = await api('/auth/me');
  if (data.error) { localStorage.removeItem('pronosai_token'); token = null; return; }
  moi = data;
  apresConnexion();
}

// ── Helpers communs ────────────────────────────────────
function getParams() {
  return {
    deb:        document.getElementById('dateDebut').value,
    fin:        document.getElementById('dateFin').value,
    coteCible:  parseFloat(document.getElementById('coteCible').value) || 3.0,
    marches:    [...document.querySelectorAll('.mchip.on')].map(c => c.dataset.m),
    cleIA:      document.getElementById('cleIA')?.value?.trim() || '',
    fourn:      document.getElementById('fourn')?.value || 'groq'
  };
}

async function fetchMatchs(deb, fin) {
  const url = `/matches?startDate=${deb}&endDate=${fin || deb}`;
  return api(url);
}

// ── Mode 1 : UN SEUL CLIC → charger + générer automatiquement ─────────────
async function genererTout() {
  const { deb, fin, coteCible, marches, cleIA, fourn } = getParams();
  if (!deb) { toast('Choisissez une date de début', 'err'); return; }
  if (!marches.length) { toast('Sélectionnez au moins un type de pari', 'err'); return; }
  if (coteCible < 1.5) { toast('La cote cible minimum est 1.5', 'err'); return; }

  document.getElementById('secFormulaire').style.display = 'none';
  document.getElementById('secMatchs').style.display    = 'none';
  document.getElementById('secResult').style.display    = 'none';
  document.getElementById('btnGenerer').disabled = true;

  // Étape 1 : Récupération des matchs
  afficherProg('📡 Étape 1/2 — Récupération des matchs…');
  let pct = 0;
  const iv = setInterval(() => { pct = Math.min(pct + 6, 45); majProg(pct); }, 300);

  let matchsData;
  try {
    matchsData = await fetchMatchs(deb, fin);
    clearInterval(iv);
    if (matchsData.error) {
      toast(matchsData.error, 'err');
      cacherProg();
      document.getElementById('secFormulaire').style.display = 'block';
      document.getElementById('btnGenerer').disabled = false;
      return;
    }
    matchsRecuperes = matchsData.matches || [];
    if (!matchsRecuperes.length) {
      toast('Aucun match trouvé pour cette période. Essayez une autre date.', 'err');
      cacherProg();
      document.getElementById('secFormulaire').style.display = 'block';
      document.getElementById('btnGenerer').disabled = false;
      return;
    }
    matchsSelectionnes = new Set(matchsRecuperes.map(m => m.id));
    majProg(50);
  } catch (e) {
    clearInterval(iv); cacherProg();
    toast('Erreur réseau : ' + e.message, 'err');
    document.getElementById('secFormulaire').style.display = 'block';
    document.getElementById('btnGenerer').disabled = false;
    return;
  }

  // Étape 2 : Génération du pronostic IA
  document.getElementById('progLabel').textContent = '🤖 Étape 2/2 — Génération du pronostic IA…';
  const iv2 = setInterval(() => { pct = Math.min(pct + 4, 95); majProg(pct); }, 400);

  try {
    const data = await api('/pronostics', {
      method: 'POST',
      body: JSON.stringify({
        matchsSelectionnes: matchsRecuperes,
        startDate: deb, endDate: fin || deb,
        coteCible, marchesSelectionnes: marches, cleIA, fournisseurIA: fourn
      })
    });
    clearInterval(iv2); majProg(100);

    if (!data.success) {
      toast(data.message || 'Aucun combiné trouvé. Réduisez la cote ou ajoutez des marchés.', 'err');
      cacherProg();
      document.getElementById('secFormulaire').style.display = 'block';
    } else {
      cacherProg();
      rendreResultat(data.data);
      document.getElementById('secResult').style.display = 'block';
      document.getElementById('secResult').scrollIntoView({ behavior: 'smooth' });
    }
  } catch (e) {
    clearInterval(iv2); cacherProg();
    toast('Erreur : ' + e.message, 'err');
    document.getElementById('secFormulaire').style.display = 'block';
  } finally {
    document.getElementById('btnGenerer').disabled = false;
  }
}

// ── Mode 2 : Choisir les matchs manuellement ──────────
async function chargerMatchsSeulement() {
  const { deb, fin } = getParams();
  if (!deb) { toast('Choisissez une date de début', 'err'); return; }

  document.getElementById('secFormulaire').style.display = 'none';
  document.getElementById('secResult').style.display    = 'none';
  afficherProg('📡 Récupération des matchs…');
  let pct = 0;
  const iv = setInterval(() => { pct = Math.min(pct + 8, 90); majProg(pct); }, 300);

  try {
    const data = await fetchMatchs(deb, fin);
    clearInterval(iv); majProg(100);
    if (data.error) { toast(data.error, 'err'); cacherProg(); document.getElementById('secFormulaire').style.display = 'block'; return; }
    matchsRecuperes = data.matches || [];
    if (!matchsRecuperes.length) {
      toast('Aucun match trouvé pour cette période.', 'err');
      cacherProg(); document.getElementById('secFormulaire').style.display = 'block'; return;
    }
    matchsSelectionnes = new Set(matchsRecuperes.map(m => m.id));
    rendreGrilleMatchs();
    cacherProg();
    document.getElementById('secMatchs').style.display = 'block';
    toast(`${matchsRecuperes.length} matchs chargés — choisissez puis cliquez Générer`, 'ok');
  } catch (e) {
    clearInterval(iv); cacherProg();
    toast('Erreur réseau : ' + e.message, 'err');
    document.getElementById('secFormulaire').style.display = 'block';
  }
}

// ── Générer depuis la sélection manuelle ───────────────
async function genererDepuisSelection() {
  const selects = matchsRecuperes.filter(m => matchsSelectionnes.has(m.id));
  if (selects.length < 2) { toast('Sélectionnez au moins 2 matchs', 'err'); return; }

  const { deb, fin, coteCible, marches, cleIA, fourn } = getParams();
  if (!marches.length) { toast('Sélectionnez au moins un type de pari', 'err'); return; }

  document.getElementById('secMatchs').style.display = 'none';
  afficherProg('🤖 Génération du pronostic IA…');
  document.getElementById('btnGen').disabled = true;

  let pct = 10;
  const iv = setInterval(() => { pct = Math.min(pct + 5, 90); majProg(pct); }, 400);

  try {
    const data = await api('/pronostics', {
      method: 'POST',
      body: JSON.stringify({
        matchsSelectionnes: selects,
        startDate: deb, endDate: fin || deb,
        coteCible, marchesSelectionnes: marches, cleIA, fournisseurIA: fourn
      })
    });
    clearInterval(iv); majProg(100);
    if (!data.success) {
      toast(data.message || 'Aucun combiné trouvé. Réduisez la cote.', 'err');
      document.getElementById('secMatchs').style.display = 'block';
    } else {
      cacherProg();
      rendreResultat(data.data);
      document.getElementById('secResult').style.display = 'block';
      document.getElementById('secResult').scrollIntoView({ behavior: 'smooth' });
    }
  } catch (e) {
    clearInterval(iv); cacherProg();
    toast('Erreur : ' + e.message, 'err');
    document.getElementById('secMatchs').style.display = 'block';
  } finally {
    document.getElementById('btnGen').disabled = false;
  }
}

function rendreGrilleMatchs() {
  const grid = document.getElementById('matchsGrid');
  grid.innerHTML = matchsRecuperes.map(m => {
    const on = matchsSelectionnes.has(m.id);
    const h = m.heure ? new Date(m.heure).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : m.date;
    return `
    <div class="mcard ${on ? 'on' : 'off'}" id="mc_${m.id}" onclick="basculeMatch('${m.id}')">
      <span class="mcard-check">${on ? '✅' : '○'}</span>
      <div class="mcard-comp">🏆 ${esc(m.competition)}</div>
      <div class="mcard-teams">${esc(m.equipe_domicile)} <span style="opacity:.35">vs</span> ${esc(m.equipe_exterieur)}</div>
      <div class="mcard-date">📅 ${h}</div>
    </div>`;
  }).join('');
  majSelCount();
}

function basculeMatch(id) {
  if (matchsSelectionnes.has(id)) matchsSelectionnes.delete(id);
  else matchsSelectionnes.add(id);
  const card = document.getElementById('mc_' + id);
  if (card) {
    const on = matchsSelectionnes.has(id);
    card.className = `mcard ${on ? 'on' : 'off'}`;
    card.querySelector('.mcard-check').textContent = on ? '✅' : '○';
  }
  majSelCount();
}

function majSelCount() {
  const n = matchsSelectionnes.size;
  document.getElementById('selCount').textContent = `${n} sélectionné${n > 1 ? 's' : ''}`;
  document.getElementById('btnGen').disabled = n < 2;
}

// ── AFFICHAGE DU RÉSULTAT AMÉLIORÉ ───────────────────
function rendreResultat(d) {
  const conf = d.confiance || 72;
  document.getElementById('resCote').textContent   = parseFloat(d.coteTotal).toFixed(2) + 'x';
  document.getElementById('resConf').textContent   = conf + '%';
  document.getElementById('resNbSel').textContent  = `${d.selections?.length || 0} sélection(s)`;
  setTimeout(() => { document.getElementById('confFill').style.width = conf + '%'; }, 100);

  document.getElementById('resSels').innerHTML = (d.selections || []).map(s => `
    <div class="sel-item">
      <div class="sel-match">⚽ ${esc(s.match)}</div>
      ${s.competition ? `<div class="sel-comp">🏆 ${esc(s.competition)}${s.date ? ' — ' + s.date : ''}</div>` : ''}
      <div class="sel-choix">${esc(s.marche)} : <strong>${esc(s.selection)}</strong> <span class="cote-pill">@ ${parseFloat(s.cote).toFixed(2)}</span></div>
    </div>`).join('');

  document.getElementById('resIA').innerHTML = esc(d.analyseIA || '');

  // Animation d'entrée
  const resultCard = document.querySelector('.result-card');
  if (resultCard) {
    resultCard.style.animation = 'none';
    resultCard.offsetHeight; // trigger reflow
    resultCard.style.animation = 'fadeUp .6s ease both';
  }
}

function resetCreation() {
  document.getElementById('secResult').style.display    = 'none';
  document.getElementById('secMatchs').style.display    = 'none';
  document.getElementById('secProg').style.display      = 'none';
  document.getElementById('secFormulaire').style.display = 'block';
  document.getElementById('btnGenerer').disabled = false;
  matchsRecuperes = []; matchsSelectionnes = new Set();
}

// ── Progress helpers ───────────────────────────────────
function afficherProg(label) {
  document.getElementById('progLabel').textContent = label;
  document.getElementById('progFill').style.width = '0%';
  document.getElementById('secProg').style.display = 'block';
}
function majProg(pct) {
  document.getElementById('progFill').style.width = pct + '%';
}
function cacherProg() {
  document.getElementById('secProg').style.display = 'none';
  document.getElementById('progFill').style.width = '0%';
}

// ── Mes pronostics ─────────────────────────────────────
async function chargerMesPronos() {
  const box = document.getElementById('mesPronos');
  box.innerHTML = '<div class="empty">⏳ Chargement…</div>';
  const data = await api('/pronostics');
  if (data.error) { box.innerHTML = `<div class="empty">${esc(data.error)}</div>`; return; }
  const list = (data.pronostics || []).slice().reverse();
  if (!list.length) { box.innerHTML = '<div class="empty">Vous n\'avez pas encore créé de pronostic.<br>Allez dans l\'onglet « Créer un pronostic ».</div>'; return; }
  box.innerHTML = list.map(p => pronoCardHTML(p, false)).join('');
}

async function supprimerMonProno(id) {
  if (!confirm('Supprimer ce pronostic définitivement ?')) return;
  const d = await api(`/pronostics/${id}`, { method: 'DELETE' });
  if (d.success) { toast('Pronostic supprimé', 'ok'); chargerMesPronos(); }
  else toast(d.error || 'Erreur', 'err');
}

function pronoCardHTML(p, admin = false) {
  const label = p.startDate + (p.endDate && p.endDate !== p.startDate ? ' → ' + p.endDate : '');
  return `
  <div class="pcard">
    <div class="pcard-head">
      <div>
        ${admin ? `<span class="badge badge-user" style="font-size:.76rem;padding:4px 10px;">👤 ${esc(p.username || '?')}</span>` : ''}
        <div style="font-weight:700;margin-top:${admin?'6':'0'}px;">📅 ${label}</div>
        <div class="pcard-meta">Créé le ${dateFr(p.cree_le || p.created_at)}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        ${pillStatut(p.statut_verification || p.verified_status)}
        <button class="bsm b-del" onclick="${admin ? `adminSupprimerProno('${p.id}')` : `supprimerMonProno('${p.id}')`}">🗑️</button>
      </div>
    </div>
    <div class="pcard-cote">${parseFloat(p.coteTotal || p.total_odd || 0).toFixed(2)}x</div>
    <div style="margin-top:10px;">
      ${(p.selections || p.combines || []).map(s => `
        <div class="sel-item">
          <div class="sel-match">⚽ ${esc(s.match)}</div>
          ${(s.competition || s.league) ? `<div class="sel-comp">🏆 ${esc(s.competition || s.league)}</div>` : ''}
          <div class="sel-choix">${esc(s.marche || s.market)} : <strong>${esc(s.selection)}</strong> <span class="cote-pill">@ ${parseFloat(s.cote || s.odd || 0).toFixed(2)}</span></div>
        </div>`).join('')}
    </div>
    ${(p.analyseIA || p.ai_analysis) ? `
    <div class="ai-box" style="margin-top:10px;">
      <div class="ai-title">🤖 Analyse IA</div>
      <div class="ai-text" style="font-size:.81rem;">${esc(p.analyseIA || p.ai_analysis)}</div>
    </div>` : ''}
  </div>`;
}

// ── Paramètres matchs (user) ───────────────────────────
async function chargerParamMatchs() {
  const date = document.getElementById('pmDate').value;
  if (!date) { toast('Choisissez une date', 'err'); return; }
  const box = document.getElementById('pmList');
  box.innerHTML = '<div class="empty">⏳ Récupération en cours…</div>';
  const data = await api(`/matches?startDate=${date}`);
  if (data.error) { box.innerHTML = `<div class="empty">${esc(data.error)}</div>`; return; }
  const m = data.matches || [];
  if (!m.length) { box.innerHTML = '<div class="empty">Aucun match trouvé pour cette date.</div>'; return; }
  box.innerHTML = `
    <div style="font-size:.79rem;opacity:.45;margin-bottom:10px;">${m.length} matchs — ESPN + TheSportsDB</div>
    <table class="dtable">
      <thead><tr><th>Compétition</th><th>Équipe domicile</th><th>Équipe extérieure</th><th>Heure</th><th>Statut</th></tr></thead>
      <tbody>${m.map(x => `
        <tr>
          <td>${esc(x.competition)}</td>
          <td><strong>${esc(x.equipe_domicile)}</strong></td>
          <td><strong>${esc(x.equipe_exterieur)}</strong></td>
          <td>${x.heure ? new Date(x.heure).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}) : '—'}</td>
          <td style="font-size:.74rem;opacity:.55;">${esc(x.statut || 'Programmé')}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

// ── Paramètres vérification (user) ────────────────────
async function chargerVerifUser() {
  const box = document.getElementById('pvList');
  box.innerHTML = '<div class="empty">⏳ Chargement…</div>';
  const data = await api('/pronostics');
  if (data.error) { box.innerHTML = `<div class="empty">${esc(data.error)}</div>`; return; }
  const list = (data.pronostics || []).slice().reverse();
  if (!list.length) { box.innerHTML = '<div class="empty">Aucun pronostic à afficher.</div>'; return; }
  box.innerHTML = list.map(p => `
    <div class="pcard" style="margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <div>
          <strong>📅 ${p.startDate}${p.endDate && p.endDate !== p.startDate ? ' → '+p.endDate : ''}</strong>
          <span class="pcard-meta" style="margin-left:8px;">${dateFr(p.cree_le)}</span>
        </div>
        ${pillStatut(p.statut_verification)}
      </div>
      <div class="pcard-cote" style="font-size:1.5rem;margin:8px 0;">${parseFloat(p.coteTotal || 0).toFixed(2)}x</div>
      <div style="font-size:.77rem;opacity:.4;">${(p.selections||[]).length} sélection(s)</div>
    </div>`).join('');
}

// ── Admin : Utilisateurs ───────────────────────────────
async function chargerAdminUsers() {
  const box = document.getElementById('adminUsers');
  box.innerHTML = '<div class="empty">⏳ Chargement…</div>';
  const data = await api('/admin/users');
  if (data.error) { box.innerHTML = `<div class="empty">${esc(data.error)}</div>`; return; }
  const users = data.users || [];
  box.innerHTML = `
    <table class="dtable">
      <thead><tr><th>Identifiant</th><th>Mot de passe</th><th>Rôle</th><th>Statut</th><th>Inscription</th><th>Actions</th></tr></thead>
      <tbody>${users.map(u => `
        <tr>
          <td><strong>${esc(u.username)}</strong></td>
          <td><span class="pwd">${esc(u.password)}</span></td>
          <td>${u.is_admin ? '<span class="pill pill-adm">👑 Admin</span>' : '👤 Membre'}</td>
          <td>${u.is_confirmed ? '<span class="pill pill-conf">✅ Confirmé</span>' : '<span class="pill pill-ncf">⏳ En attente</span>'}</td>
          <td style="font-size:.75rem;opacity:.45;">${dateFr(u.created_at)}</td>
          <td style="display:flex;gap:6px;flex-wrap:wrap;padding:8px 12px;">
            ${!u.is_admin && !u.is_confirmed ? `<button class="bsm b-conf" onclick="confirmerUser('${u.id}')">✅ Confirmer</button>` : ''}
            ${!u.is_admin ? `<button class="bsm b-del" onclick="supprimerUser('${u.id}','${esc(u.username)}')">🗑️ Supprimer</button>` : ''}
          </td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

async function confirmerUser(id) {
  const d = await api(`/admin/users/${id}/confirm`, { method: 'POST' });
  if (d.success) { toast(d.message, 'ok'); chargerAdminUsers(); }
  else toast(d.error || 'Erreur', 'err');
}
async function supprimerUser(id, nom) {
  if (!confirm(`Supprimer le membre "${nom}" et tous ses pronostics ?`)) return;
  const d = await api(`/admin/users/${id}`, { method: 'DELETE' });
  if (d.success) { toast(d.message, 'ok'); chargerAdminUsers(); }
  else toast(d.error || 'Erreur', 'err');
}

// ── Admin : Tous les pronostics ────────────────────────
async function chargerAdminPronos() {
  const box = document.getElementById('adminPronos');
  box.innerHTML = '<div class="empty">⏳ Chargement…</div>';
  const data = await api('/admin/pronostics');
  if (data.error) { box.innerHTML = `<div class="empty">${esc(data.error)}</div>`; return; }
  const list = (data.pronostics || []).slice().reverse();
  document.getElementById('pronoBadge').textContent = list.length;
  if (!list.length) { box.innerHTML = '<div class="empty">Aucun pronostic créé pour l\'instant.</div>'; return; }
  box.innerHTML = list.map(p => pronoCardHTML(p, true)).join('');
}
async function adminSupprimerProno(id) {
  if (!confirm('Supprimer ce pronostic ?')) return;
  const d = await api(`/admin/pronostics/${id}`, { method: 'DELETE' });
  if (d.success) { toast('Supprimé', 'ok'); chargerAdminPronos(); }
  else toast(d.error || 'Erreur', 'err');
}

// ── Admin : Paramètres Matchs ──────────────────────────
async function chargerAdminMatchs() {
  const start = document.getElementById('amStart').value;
  const end   = document.getElementById('amEnd').value   || start;
  if (!start) { toast('Choisissez une date', 'err'); return; }
  const box   = document.getElementById('amTable');
  const stats = document.getElementById('amStats');
  box.innerHTML = '<div class="empty">⏳ Récupération ESPN + TheSportsDB…</div>';
  stats.textContent = '';
  const data = await api(`/matches?startDate=${start}&endDate=${end}`);
  if (data.error) { box.innerHTML = `<div class="empty">${esc(data.error)}</div>`; return; }
  const m = data.matches || [];
  stats.textContent = `${m.length} matchs récupérés sur ${(data.dates||[start]).length} jour(s) — Sources : ESPN API + TheSportsDB`;
  if (!m.length) { box.innerHTML = '<div class="empty">Aucun match trouvé.</div>'; return; }
  box.innerHTML = `
    <table class="dtable">
      <thead><tr><th>Date</th><th>Compétition</th><th>Domicile</th><th>Extérieur</th><th>Heure</th><th>Statut</th></tr></thead>
      <tbody>${m.map(x => `
        <tr>
          <td style="font-size:.78rem;opacity:.6;">${x.date}</td>
          <td>${esc(x.competition)}</td>
          <td><strong>${esc(x.equipe_domicile)}</strong></td>
          <td><strong>${esc(x.equipe_exterieur)}</strong></td>
          <td>${x.heure ? new Date(x.heure).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}) : '—'}</td>
          <td style="font-size:.73rem;opacity:.5;">${esc(x.statut || 'Programmé')}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

// ── Admin : Paramètres Vérifier ────────────────────────
async function chargerAdminVerif() {
  const box = document.getElementById('avList');
  box.innerHTML = '<div class="empty">⏳ Chargement…</div>';
  const data = await api('/admin/pronostics');
  if (data.error) { box.innerHTML = `<div class="empty">${esc(data.error)}</div>`; return; }
  const list = (data.pronostics || []).slice().reverse();
  if (!list.length) { box.innerHTML = '<div class="empty">Aucun pronostic à vérifier.</div>'; return; }
  box.innerHTML = `
    <table class="dtable">
      <thead><tr><th>Membre</th><th>Date(s)</th><th>Cote</th><th>Sélections</th><th>Statut actuel</th><th>Vérifier</th></tr></thead>
      <tbody>${list.map(p => `
        <tr id="vr_${p.id}">
          <td><strong>${esc(p.username || '?')}</strong></td>
          <td style="font-size:.79rem;">${p.startDate}${p.endDate&&p.endDate!==p.startDate?'→'+p.endDate:''}</td>
          <td><strong>${parseFloat(p.coteTotal||p.total_odd||0).toFixed(2)}x</strong></td>
          <td style="font-size:.75rem;opacity:.5;">${(p.selections||p.combines||[]).map(s=>esc((s.match||'').split(' - ')[0]||s.match||'?')).slice(0,3).join(', ')}…</td>
          <td id="vs_${p.id}">${pillStatut(p.statut_verification||p.verified_status)}</td>
          <td style="display:flex;gap:5px;padding:8px 12px;">
            <button class="bsm b-conf" onclick="verifierProno('${p.id}','verifie')" title="Marquer gagné">✅ Gagné</button>
            <button class="bsm b-del"  onclick="verifierProno('${p.id}','perdu')"   title="Marquer perdu">❌ Perdu</button>
            <button class="bsm b-ver"  onclick="verifierProno('${p.id}','en_attente')" title="Remettre en attente">⏳</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

async function verifierProno(id, statut) {
  const d = await api(`/admin/pronostics/${id}/verify`, { method: 'POST', body: JSON.stringify({ status: statut }) });
  if (d.success) {
    const el = document.getElementById(`vs_${id}`);
    if (el) el.innerHTML = pillStatut(statut);
    toast('Statut mis à jour', 'ok');
  } else toast(d.error || 'Erreur', 'err');
}

// ── Admin : Configuration ──────────────────────────────
let configActuelle = {};

async function chargerConfig() {
  const grid = document.getElementById('cfgGrid');
  const data = await api('/config');
  configActuelle = data;

  const champs = [
    { key: 'displayedUsers',   label: '👤 Membres affichés',       val: data.displayedUsers },
    { key: 'matchsAnalyses',   label: '⚽ Matchs analysés',        val: data.stats?.matchsAnalyses },
    { key: 'pronosticsGeneres',label: '🎯 Pronostics générés',     val: data.stats?.pronosticsGeneres },
    { key: 'tauxReussite',     label: '📈 Taux de réussite (%)',    val: data.stats?.tauxReussite }
  ];

  grid.innerHTML = champs.map(c => `
    <div class="cfg-item">
      <div class="cfg-label">${c.label}</div>
      <input class="cfg-input" type="number" id="cfg_${c.key}" value="${c.val || 0}" min="0">
    </div>`).join('');

  const real = document.getElementById('statsReelles');
  real.innerHTML = `
    <table class="dtable">
      <tbody>
        <tr><td style="opacity:.55;">Membres réels inscrits</td><td><strong>${data.realUsers || 0}</strong></td></tr>
        <tr><td style="opacity:.55;">Valeur affichée (configurable)</td><td><strong>${data.displayedUsers || 0}+</strong></td></tr>
      </tbody>
    </table>`;
}

async function sauvegarderConfig() {
  const msg = document.getElementById('cfgMsg');
  const body = {
    displayedUsers:    document.getElementById('cfg_displayedUsers')?.value,
    matchsAnalyses:    document.getElementById('cfg_matchsAnalyses')?.value,
    pronosticsGeneres: document.getElementById('cfg_pronosticsGeneres')?.value,
    tauxReussite:      document.getElementById('cfg_tauxReussite')?.value
  };
  const d = await api('/admin/config', { method: 'POST', body: JSON.stringify(body) });
  if (d.success) {
    msg.className = 'auth-msg ok'; msg.textContent = '✅ Configuration sauvegardée avec succès !';
    toast('Configuration mise à jour', 'ok');
    setTimeout(() => { msg.className = 'auth-msg'; }, 3000);
  } else {
    msg.className = 'auth-msg err'; msg.textContent = d.error || 'Erreur';
  }
}

// ── Télécharger ZIP ────────────────────────────────────
function telechargerZip() {
  window.location.href = '/admin/export-zip';
  toast('Téléchargement de molo.zip…', 'inf');
}

// ── Saisie clavier ─────────────────────────────────────
function initKeyboard() {
  document.getElementById('connPass')?.addEventListener('keydown', e => { if (e.key === 'Enter') doConnexion(); });
  document.getElementById('connUser')?.addEventListener('keydown', e => { if (e.key === 'Enter') doConnexion(); });
  document.getElementById('inscPass')?.addEventListener('keydown', e => { if (e.key === 'Enter') doInscription(); });
}

// ── Init ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initMarches();
  initKeyboard();

  const auj = new Date().toISOString().split('T')[0];
  const setDate = id => { const el = document.getElementById(id); if (el) el.value = auj; };
  setDate('amStart'); setDate('amEnd'); setDate('pmDate');

  chargerStats();
  restaurerSession();
});

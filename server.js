const express = require('express');
const cors = require('cors');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = parseInt(process.env.PORT) || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const JWT_SECRET = process.env.JWT_SECRET || 'pronosai_secret_2026_xK9m';

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const PRONOSTICS_FILE = path.join(DATA_DIR, 'pronostics.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

console.log('═══════════════════════════════════════');
console.log('🚀 PRONOSAI PRO - DÉMARRAGE');
console.log('═══════════════════════════════════════');

// ── Middleware global : catch erreurs et retourne toujours JSON ───────────────
app.use((err, req, res, next) => {
  console.error('❌ Erreur:', err);
  res.status(500).json({ error: 'Erreur serveur interne', detail: err.message });
});

// ── Initialisation ────────────────────────────────────────────────────────────
function initAdmin() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  let users = readUsers();
  const adminExists = users.find(u => u.username === 'sossoukouam');
  if (!adminExists) {
    users.push({
      id: 'admin_001', username: 'sossoukouam', password: 'arrow2026',
      is_admin: true, is_confirmed: true, created_at: new Date().toISOString()
    });
    writeUsers(users);
    console.log('✅ Compte administrateur créé');
  }
  if (!fs.existsSync(PRONOSTICS_FILE)) writePronostics([]);
  if (!fs.existsSync(CONFIG_FILE)) {
    writeConfig({ displayedUsers: 1247, stats: { matchsAnalyses: 8432, pronosticsGeneres: 3891, tauxReussite: 73 } });
  }
}

// ── Helpers JSON ──────────────────────────────────────────────────────────────
function readUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')).users || []; } catch { return []; }
}
function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify({ users }, null, 2));
}
function readPronostics() {
  try { return JSON.parse(fs.readFileSync(PRONOSTICS_FILE, 'utf8')).pronostics || []; } catch { return []; }
}
function writePronostics(pronostics) {
  fs.writeFileSync(PRONOSTICS_FILE, JSON.stringify({ pronostics }, null, 2));
}
function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
  catch { return { displayedUsers: 1247, stats: { matchsAnalyses: 8432, pronosticsGeneres: 3891, tauxReussite: 73 } }; }
}
function writeConfig(cfg) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ── Middleware ────────────────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token requis' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Token invalide ou expiré' }); }
}
function adminMiddleware(req, res, next) {
  authMiddleware(req, res, () => {
    if (!req.user.is_admin) return res.status(403).json({ error: 'Accès réservé à l\'administrateur' });
    next();
  });
}
function confirmedMiddleware(req, res, next) {
  authMiddleware(req, res, () => {
    if (!req.user.is_confirmed && !req.user.is_admin)
      return res.status(403).json({ error: 'Compte en attente de confirmation' });
    next();
  });
}

// ── Config publique ───────────────────────────────────────────────────────────
app.get('/config', (req, res) => {
  const cfg = readConfig();
  const realUsers = readUsers().filter(u => !u.is_admin).length;
  res.json({ ...cfg, realUsers });
});

// ── Admin : Modifier la config ────────────────────────────────────────────────
app.post('/admin/config', adminMiddleware, (req, res) => {
  const { displayedUsers, matchsAnalyses, pronosticsGeneres, tauxReussite } = req.body;
  const cfg = readConfig();
  if (displayedUsers !== undefined) cfg.displayedUsers = parseInt(displayedUsers) || cfg.displayedUsers;
  if (matchsAnalyses !== undefined) cfg.stats.matchsAnalyses = parseInt(matchsAnalyses) || cfg.stats.matchsAnalyses;
  if (pronosticsGeneres !== undefined) cfg.stats.pronosticsGeneres = parseInt(pronosticsGeneres) || cfg.stats.pronosticsGeneres;
  if (tauxReussite !== undefined) cfg.stats.tauxReussite = parseInt(tauxReussite) || cfg.stats.tauxReussite;
  writeConfig(cfg);
  console.log('⚙️ [Admin] Config mise à jour');
  res.json({ success: true, config: cfg });
});

// ── AUTH : Register ───────────────────────────────────────────────────────────
app.post('/auth/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Identifiant et mot de passe requis' });
  if (username.length < 3) return res.status(400).json({ error: 'Identifiant trop court (min 3 caractères)' });
  if (password.length < 4) return res.status(400).json({ error: 'Mot de passe trop court (min 4 caractères)' });
  const users = readUsers();
  if (users.find(u => u.username === username))
    return res.status(409).json({ error: 'Cet identifiant est déjà utilisé' });
  const newUser = {
    id: genId(), username, password,
    is_admin: false, is_confirmed: false, created_at: new Date().toISOString()
  };
  users.push(newUser);
  writeUsers(users);
  console.log(`📝 [Auth] Nouveau membre: ${username}`);
  res.json({ success: true, message: 'Compte créé avec succès ! En attente de confirmation par l\'administrateur.' });
});

// ── AUTH : Login ──────────────────────────────────────────────────────────────
app.post('/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Identifiant et mot de passe requis' });
  const users = readUsers();
  const user = users.find(u => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect' });
  const token = jwt.sign({
    id: user.id, username: user.username, is_admin: user.is_admin, is_confirmed: user.is_confirmed
  }, JWT_SECRET, { expiresIn: '7d' });
  console.log(`🔑 [Auth] Connexion: ${username}`);
  res.json({ success: true, token, user: { id: user.id, username: user.username, is_admin: user.is_admin, is_confirmed: user.is_confirmed } });
});

// ── AUTH : Me ─────────────────────────────────────────────────────────────────
app.get('/auth/me', authMiddleware, (req, res) => {
  const users = readUsers();
  const user = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
  res.json({ id: user.id, username: user.username, is_admin: user.is_admin, is_confirmed: user.is_confirmed, created_at: user.created_at });
});

// ── ADMIN : Utilisateurs ──────────────────────────────────────────────────────
app.get('/admin/users', adminMiddleware, (req, res) => {
  res.json({ users: readUsers() });
});
app.post('/admin/users/:id/confirm', adminMiddleware, (req, res) => {
  const users = readUsers();
  const idx = users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Utilisateur introuvable' });
  users[idx].is_confirmed = true;
  writeUsers(users);
  console.log(`✅ [Admin] Compte confirmé: ${users[idx].username}`);
  res.json({ success: true, message: `${users[idx].username} confirmé avec succès` });
});
app.delete('/admin/users/:id', adminMiddleware, (req, res) => {
  let users = readUsers();
  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
  if (user.is_admin) return res.status(403).json({ error: 'Impossible de supprimer l\'administrateur' });
  writeUsers(users.filter(u => u.id !== req.params.id));
  writePronostics(readPronostics().filter(p => p.user_id !== req.params.id));
  console.log(`🗑️ [Admin] Compte supprimé: ${user.username}`);
  res.json({ success: true, message: `${user.username} supprimé` });
});

// ── ADMIN : Pronostics ────────────────────────────────────────────────────────
app.get('/admin/pronostics', adminMiddleware, (req, res) => {
  const pronostics = readPronostics();
  const users = readUsers();
  res.json({
    pronostics: pronostics.map(p => ({
      ...p, username: users.find(u => u.id === p.user_id)?.username || 'Inconnu'
    }))
  });
});
app.post('/admin/pronostics/:id/verify', adminMiddleware, (req, res) => {
  const { status } = req.body;
  const pronostics = readPronostics();
  const idx = pronostics.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Pronostic introuvable' });
  pronostics[idx].verified_status = status || 'verifie';
  pronostics[idx].verified_at = new Date().toISOString();
  writePronostics(pronostics);
  res.json({ success: true });
});
app.delete('/admin/pronostics/:id', adminMiddleware, (req, res) => {
  writePronostics(readPronostics().filter(p => p.id !== req.params.id));
  res.json({ success: true });
});

// ── Base de données des clubs reconnus pour l'analyse ─────────────────────────
const CLUBS_ELITE = new Set([
  'real madrid','barcelona','manchester city','manchester united','liverpool','chelsea',
  'arsenal','tottenham','bayern munich','borussia dortmund','rb leipzig','bayer leverkusen',
  'paris saint-germain','psg','olympique de marseille','lyon','monaco','nice',
  'juventus','inter milan','inter','ac milan','napoli','roma','lazio','atalanta',
  'atletico madrid','sevilla','real sociedad','villarreal','athletic bilbao',
  'ajax','psv','feyenoord','benfica','porto','sporting cp','sporting','braga',
  'celtic','rangers','galatasaray','fenerbahce','besiktas','trabzonspor',
  'flamengo','fluminense','palmeiras','atletico mineiro','corinthians',
  'boca juniors','river plate','racing club','independiente','san lorenzo',
  'america','chivas','cruz azul','pumas','monterrey','tigres',
  'la galaxy','nycfc','atlanta united','inter miami','seattle sounders',
]);
const CLUBS_FORTS = new Set([
  'west ham','aston villa','newcastle','brighton','brentford','fulham','everton',
  'bologna','fiorentina','torino','sassuolo','udinese','lecce',
  'real betis','getafe','girona','valencia','osasuna','mallorca','granada',
  'marseille','rennes','lens','lille','strasbourg','nantes','saint-etienne',
  'cologne','freiburg','hoffenheim','wolfsburg','eintracht frankfurt','mainz',
  'antwerp','gent','club brugge','anderlecht','genk',
  'gremio','sao paulo','santos','bahia','botafogo','vasco',
  'penafiel','vitoria','moreirense',
  'inter miami','toronto fc','cf montreal','dc united',
]);
const COMPETITIONS_PRESTIGE = {
  'ligue des champions': 10, 'champions league': 10, 'ligue europa': 8, 'europa league': 8,
  'conference league': 7, 'coupe du monde': 10, 'world cup': 10,
  'premier league': 9, 'ligue 1': 8, 'bundesliga': 9, 'serie a': 9, 'liga': 9, 'la liga': 9,
  'primera division': 8, 'eredivisie': 7, 'primeira liga': 7, 'süper lig': 7,
  'jupiler': 7, 'premiership': 6, 'championship': 6, 'serie b': 5, 'ligue 2': 5,
  'brasileirao': 7, 'serie a (brésil)': 7, 'mls': 6, 'liga mx': 7,
};
function niveauCompetition(competition) {
  if (!competition) return 5;
  const c = competition.toLowerCase();
  for (const [k, v] of Object.entries(COMPETITIONS_PRESTIGE)) if (c.includes(k)) return v;
  return 5;
}
function niveauEquipe(nom) {
  const n = (nom || '').toLowerCase();
  if ([...CLUBS_ELITE].some(c => n.includes(c))) return 'élite';
  if ([...CLUBS_FORTS].some(c => n.includes(c))) return 'fort';
  return 'standard';
}
function forceRelative(dom, ext) {
  const nd = niveauEquipe(dom), ne = niveauEquipe(ext);
  const ranks = { 'élite': 3, 'fort': 2, 'standard': 1 };
  return { dom: ranks[nd], ext: ranks[ne], nd, ne };
}

// ── MATCHS : Génération des cotes ────────────────────────────────────────────
function genererCotes(domicile, exterieur) {
  const seed = (domicile + exterieur).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const r = (min, max, off = 0) => parseFloat((min + ((seed + off) % 1000) / 1000 * (max - min)).toFixed(2));

  // Force relative pour calibrer les cotes
  const { dom, ext } = forceRelative(domicile, exterieur);
  const avantage = dom - ext; // positif = domicile favoris

  // Cotes 1X2 calibrées selon force
  let coteDom, coteNul, coteExt;
  if (avantage >= 2) {
    coteDom = r(1.30, 1.80, 0); coteNul = r(3.20, 4.50, 17); coteExt = r(4.50, 8.00, 37);
  } else if (avantage === 1) {
    coteDom = r(1.65, 2.50, 0); coteNul = r(2.80, 3.80, 17); coteExt = r(2.80, 5.00, 37);
  } else if (avantage === 0) {
    coteDom = r(2.00, 3.20, 0); coteNul = r(2.80, 3.50, 17); coteExt = r(2.20, 3.50, 37);
  } else if (avantage === -1) {
    coteDom = r(2.50, 4.50, 0); coteNul = r(2.80, 3.80, 17); coteExt = r(1.65, 2.50, 37);
  } else {
    coteDom = r(4.50, 8.00, 0); coteNul = r(3.20, 4.50, 17); coteExt = r(1.30, 1.80, 37);
  }

  const over15 = r(1.20, 1.55, 11);
  const over25 = r(1.55, 2.20, 53);
  const over35 = r(2.40, 3.80, 61);
  const bttsOui = r(1.60, 2.10, 71);
  const bttsNon = parseFloat(Math.max(1.50, (3.80 - bttsOui)).toFixed(2));

  // Tirs cadrés : match offensif ou non
  const tirsPlus = r(1.65, 2.10, 79);
  const cornerPlus = r(1.70, 2.10, 89);
  const fautesPlus = r(1.70, 2.10, 103);

  // Score exact : les plus probables selon force
  const scores = avantage >= 1
    ? [['1-0', r(4.0,7.0,7)],['2-0', r(5.0,9.0,11)],['2-1', r(5.5,9.5,13)],['1-1', r(5.0,8.0,17)],['3-1', r(9.0,16.0,19)]]
    : avantage <= -1
    ? [['0-1', r(4.0,7.0,7)],['0-2', r(5.0,9.0,11)],['1-2', r(5.5,9.5,13)],['1-1', r(5.0,8.0,17)],['0-3', r(9.0,16.0,19)]]
    : [['1-1', r(4.5,7.0,7)],['1-0', r(5.0,8.0,11)],['0-1', r(5.0,8.0,13)],['2-1', r(7.0,11.0,17)],['0-0', r(6.0,10.0,19)]];

  // Buts domicile / extérieur individuel
  const butsDom1p = r(1.60, 2.10, 43);
  const butsExt1p = r(1.80, 2.40, 57);
  const domPlus15 = r(1.90, 2.60, 67);
  const extPlus15 = r(2.10, 3.00, 73);

  // Hors-jeu (nb de hors-jeu total match)
  const horsjeuPlus = r(1.75, 2.20, 121);

  return {
    'Victoire': [
      { nom: `Victoire ${domicile}`, cote: coteDom },
      { nom: 'Match Nul', cote: coteNul },
      { nom: `Victoire ${exterieur}`, cote: coteExt }
    ],
    'Double chance': [
      { nom: `${domicile} ou Nul (1X)`, cote: parseFloat(Math.max(1.10, coteDom * 0.58).toFixed(2)) },
      { nom: `${exterieur} ou Nul (X2)`, cote: parseFloat(Math.max(1.10, coteExt * 0.58).toFixed(2)) },
      { nom: `${domicile} ou ${exterieur} (12)`, cote: parseFloat(Math.max(1.05, Math.min(coteDom,coteExt) * 0.65).toFixed(2)) }
    ],
    'Total Buts': [
      { nom: 'Plus de 1.5 buts', cote: over15 },
      { nom: 'Plus de 2.5 buts', cote: over25 },
      { nom: 'Plus de 3.5 buts', cote: over35 },
      { nom: 'Moins de 2.5 buts', cote: parseFloat(Math.max(1.40, (4.50 - over25)).toFixed(2)) },
      { nom: 'Moins de 3.5 buts', cote: parseFloat(Math.max(1.20, (3.20 - over35 + 0.6)).toFixed(2)) }
    ],
    'Les deux équipes marquent': [
      { nom: 'Les 2 marquent — Oui', cote: bttsOui },
      { nom: 'Les 2 marquent — Non', cote: bttsNon }
    ],
    'Buts Domicile': [
      { nom: `${domicile} marque (Plus de 0.5)`, cote: butsDom1p },
      { nom: `${domicile} marque 1+ but`, cote: domPlus15 },
      { nom: `${domicile} — Moins de 1.5`, cote: parseFloat(Math.max(1.40, (3.80 - butsDom1p)).toFixed(2)) }
    ],
    'Buts Extérieur': [
      { nom: `${exterieur} marque (Plus de 0.5)`, cote: butsExt1p },
      { nom: `${exterieur} marque 1+ but`, cote: extPlus15 },
      { nom: `${exterieur} — Moins de 1.5`, cote: parseFloat(Math.max(1.30, (3.60 - butsExt1p)).toFixed(2)) }
    ],
    'Score exact': scores.map(([s, c]) => ({ nom: `Score exact ${s}`, cote: c })),
    'Corners': [
      { nom: 'Plus de 8.5 corners', cote: cornerPlus },
      { nom: 'Plus de 10.5 corners', cote: r(2.10, 3.00, 95) },
      { nom: 'Moins de 9.5 corners', cote: parseFloat(Math.max(1.50, (3.80 - cornerPlus)).toFixed(2)) }
    ],
    'Tirs cadrés': [
      { nom: 'Plus de 5.5 tirs cadrés', cote: tirsPlus },
      { nom: 'Plus de 7.5 tirs cadrés', cote: r(2.00, 2.80, 113) },
      { nom: 'Moins de 5.5 tirs cadrés', cote: parseFloat(Math.max(1.50, (3.90 - tirsPlus)).toFixed(2)) }
    ],
    'Fautes': [
      { nom: 'Plus de 20.5 fautes', cote: fautesPlus },
      { nom: 'Plus de 25.5 fautes', cote: r(2.10, 3.10, 109) },
      { nom: 'Moins de 20.5 fautes', cote: parseFloat(Math.max(1.45, (3.80 - fautesPlus)).toFixed(2)) }
    ],
    'Hors-jeu': [
      { nom: 'Plus de 3.5 hors-jeu', cote: horsjeuPlus },
      { nom: 'Plus de 5.5 hors-jeu', cote: r(2.20, 3.20, 127) },
      { nom: 'Moins de 3.5 hors-jeu', cote: parseFloat(Math.max(1.50, (3.90 - horsjeuPlus)).toFixed(2)) }
    ]
  };
}

// Traduit les noms de ligues ESPN en français
function traduireCompetition(nom) {
  const map = {
    'FIFA World Cup': 'Coupe du Monde FIFA',
    'FIFA World Cup 2026': 'Coupe du Monde FIFA 2026',
    'Brazilian Serie A': 'Championnat du Brésil (Série A)',
    'Argentine Primera Division': 'Championnat d\'Argentine (División 1)',
    'Mexican Liga BBVA MX': 'Liga MX (Mexique)',
    'Major League Soccer': 'MLS (États-Unis)',
    'Spanish La Liga': 'Liga (Espagne)',
    'English Premier League': 'Premier League (Angleterre)',
    'German Bundesliga': 'Bundesliga (Allemagne)',
    'Italian Serie A': 'Serie A (Italie)',
    'French Ligue 1': 'Ligue 1 (France)',
    'UEFA Champions League': 'Ligue des Champions UEFA',
    'UEFA Europa League': 'Ligue Europa UEFA',
    'English League Championship': 'Championship (Angleterre)',
    'Dutch Eredivisie': 'Eredivisie (Pays-Bas)',
    'Portuguese Primeira Liga': 'Primeira Liga (Portugal)',
    'Turkish Super Lig': 'Süper Lig (Turquie)',
    'Belgian First Division A': 'Jupiler Pro League (Belgique)',
    'Scottish Premiership': 'Premiership (Écosse)',
    'Soccer': 'Football',
  };
  if (!nom) return 'Football International';
  for (const [en, fr] of Object.entries(map)) {
    if (nom.toLowerCase().includes(en.toLowerCase())) return fr;
  }
  return nom;
}

function traduireStatut(statut) {
  if (!statut) return 'Programmé';
  if (statut.includes('IN_PROGRESS') || statut.includes('LIVE')) return 'En cours';
  if (statut.includes('FINAL') || statut.includes('FULL_TIME')) return 'Terminé';
  if (statut.includes('HALF_TIME')) return 'Mi-temps';
  if (statut.includes('POSTPONED')) return 'Reporté';
  if (statut.includes('CANCELED') || statut.includes('CANCELLED')) return 'Annulé';
  return 'Programmé';
}

async function recupererMatchesDate(date) {
  const espnDate = date.replace(/-/g, '');
  const ENDPOINTS = [
    `https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard?dates=${espnDate}`,
    `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${espnDate}`,
    `https://site.api.espn.com/apis/site/v2/sports/soccer/bra.1/scoreboard?dates=${espnDate}`,
    `https://site.api.espn.com/apis/site/v2/sports/soccer/arg.1/scoreboard?dates=${espnDate}`,
    `https://site.api.espn.com/apis/site/v2/sports/soccer/mex.1/scoreboard?dates=${espnDate}`,
    `https://site.api.espn.com/apis/site/v2/sports/soccer/usa.1/scoreboard?dates=${espnDate}`,
    `https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard?dates=${espnDate}`,
    `https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard?dates=${espnDate}`,
    `https://site.api.espn.com/apis/site/v2/sports/soccer/ger.1/scoreboard?dates=${espnDate}`,
    `https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/scoreboard?dates=${espnDate}`,
    `https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/scoreboard?dates=${espnDate}`,
    `https://site.api.espn.com/apis/site/v2/sports/soccer/tur.1/scoreboard?dates=${espnDate}`,
  ];
  const allMatches = [];
  const seen = new Set();
  await Promise.allSettled(ENDPOINTS.map(async (url) => {
    try {
      const resp = await axios.get(url, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });
      for (const e of (resp.data?.events || [])) {
        const comp = e.competitions?.[0];
        if (!comp) continue;
        const home = comp.competitors?.find(t => t.homeAway === 'home')?.team?.displayName;
        const away = comp.competitors?.find(t => t.homeAway === 'away')?.team?.displayName;
        if (!home || !away) continue;
        const key = `${date}|${home}|${away}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const ligue = traduireCompetition(e.competitions?.[0]?.league?.name || e.name || '');
        allMatches.push({
          id: `espn_${e.id}`,
          equipe_domicile: home,
          equipe_exterieur: away,
          competition: ligue,
          date,
          heure: comp.startDate || comp.date || `${date}T00:00:00Z`,
          statut: traduireStatut(comp.status?.type?.name),
          marches: genererCotes(home, away)
        });
      }
    } catch {}
  }));
  try {
    const resp = await axios.get(
      `https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=${date}&s=Soccer`,
      { timeout: 6000, headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    for (const e of (resp.data?.events || [])) {
      const key = `${date}|${e.strHomeTeam}|${e.strAwayTeam}`;
      if (seen.has(key)) continue;
      seen.add(key);
      allMatches.push({
        id: `tsdb_${e.idEvent}`,
        equipe_domicile: e.strHomeTeam,
        equipe_exterieur: e.strAwayTeam,
        competition: traduireCompetition(e.strLeague || ''),
        date,
        heure: `${e.dateEvent}T${e.strTime || '00:00:00'}`,
        statut: 'Programmé',
        marches: genererCotes(e.strHomeTeam, e.strAwayTeam)
      });
    }
  } catch {}
  return allMatches;
}

// ── MATCHS : Endpoint ─────────────────────────────────────────────────────────
app.get('/matches', confirmedMiddleware, async (req, res) => {
  const { startDate, endDate } = req.query;
  if (!startDate) return res.status(400).json({ error: 'La date de début est requise' });
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : new Date(startDate);
  const MAX_JOURS = 10;
  const diff = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
  if (diff > MAX_JOURS) return res.status(400).json({ error: `Plage maximale : ${MAX_JOURS} jours` });
  const dates = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1))
    dates.push(d.toISOString().split('T')[0]);
  console.log(`📡 [Matchs] Récupération: ${dates.join(', ')}`);
  const results = await Promise.all(dates.map(recupererMatchesDate));
  const allMatches = results.flat();
  console.log(`✅ [Matchs] ${allMatches.length} matchs trouvés`);
  res.json({ matches: allMatches, total: allMatches.length, dates });
});

// ── PRONOSTICS : Créer ────────────────────────────────────────────────────────
// FILTRE: aucune cote inférieure à 1.20
const COTE_MIN = 1.20;

function genererCombines(matches, marches, coteCible, maxMatchs) {
  const resultats = [];

  // Filtrer les marchés pour ne garder que les cotes >= COTE_MIN
  const matchesFiltres = matches.map(m => {
    const marchesFiltres = {};
    for (const mk of marches) {
      if (m.marches?.[mk]) {
        const issuesValides = m.marches[mk].filter(i => i.cote >= COTE_MIN);
        if (issuesValides.length > 0) {
          marchesFiltres[mk] = issuesValides;
        }
      }
    }
    return { ...m, marches: marchesFiltres };
  }).filter(m => Object.keys(m.marches).length > 0);

  function backtrack(idx, current, coteActuelle) {
    if (coteActuelle >= coteCible && current.length >= 2) {
      // Vérifier qu'aucune cote individuelle n'est < COTE_MIN
      const toutesCotesValides = current.every(s => s.cote >= COTE_MIN);
      if (!toutesCotesValides) return;

      // Confiance calculée : plus les cotes individuelles sont basses (= plus probables), plus on est confiant
      const coteMoyenne = coteActuelle / current.length;
      const conf = Math.max(30, Math.min(95, Math.round(110 - coteMoyenne * 18)));
      resultats.push({ selections: [...current], coteTotal: parseFloat(coteActuelle.toFixed(2)), confiance: conf });
      if (resultats.length >= 100) return;
    }
    if (idx >= matchesFiltres.length || current.length >= maxMatchs || resultats.length >= 100) return;
    const m = matchesFiltres[idx];
    for (const marche of marches.filter(mk => m.marches?.[mk])) {
      for (const issue of (m.marches[marche] || [])) {
        if (issue.cote < COTE_MIN) continue; // Double vérification
        backtrack(idx + 1, [...current, {
          match: `${m.equipe_domicile} - ${m.equipe_exterieur}`,
          competition: m.competition || '',
          date: m.date || '',
          marche,
          selection: issue.nom,
          cote: issue.cote
        }], coteActuelle * issue.cote);
      }
    }
    backtrack(idx + 1, current, coteActuelle);
  }
  backtrack(0, [], 1);
  return resultats;
}

// ── Analyse algorithmique complète (sans clé IA) ──────────────────────────────
function analyserSansIA(selections, coteTotal) {
  const lignes = [];

  // --- En-tête ---
  const nbSels = selections.length;
  const risque = coteTotal < 3 ? 'FAIBLE' : coteTotal < 6 ? 'MODÉRÉ' : coteTotal < 12 ? 'ÉLEVÉ' : 'TRÈS ÉLEVÉ';
  const emoji = coteTotal < 3 ? '🟢' : coteTotal < 6 ? '🟡' : coteTotal < 12 ? '🟠' : '🔴';
  lignes.push(`${emoji} ANALYSE PRONOSAI — ${nbSels} sélection(s) | Cote totale : ${coteTotal}x | Risque : ${risque}\n`);

  // --- Analyse sélection par sélection ---
  lignes.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lignes.push('📋 ANALYSE DE CHAQUE SÉLECTION\n');

  for (const s of selections) {
    const [dom, ext] = (s.match || '').split(' - ');
    const { nd, ne } = forceRelative(dom, ext);
    const c = parseFloat(s.cote);

    // Niveau de certitude basé sur la cote
    const certitude = c < 1.50 ? 'Très probable' : c < 2.00 ? 'Probable' : c < 2.80 ? 'Incertain' : 'Risqué';
    const starIcon = c < 1.50 ? '⭐⭐⭐' : c < 2.00 ? '⭐⭐' : c < 2.80 ? '⭐' : '⚡';

    lignes.push(`⚽ ${s.match}`);
    if (s.competition) lignes.push(`   🏆 Compétition : ${s.competition}`);
    lignes.push(`   ✅ Sélection : ${s.marche} → ${s.selection}`);
    lignes.push(`   💰 Cote : ${c.toFixed(2)} | ${starIcon} ${certitude}`);

    // Analyse contextuelle des équipes
    const domLevel = nd === 'élite' ? 'club de premier plan (élite mondiale)' : nd === 'fort' ? 'solide équipe de milieu de tableau' : 'équipe standard';
    const extLevel = ne === 'élite' ? 'club de premier plan (élite mondiale)' : ne === 'fort' ? 'solide équipe' : 'équipe de niveau standard';

    if (dom && ext) {
      lignes.push(`   📊 ${dom} (${domLevel}) vs ${ext} (${extLevel})`);
    }

    // Analyse par type de marché
    const m = (s.marche || '').toLowerCase();
    if (m.includes('victoire')) {
      const fav = s.selection.toLowerCase().includes(dom?.toLowerCase() || '') ? dom : ext;
      const isHome = fav === dom;
      lignes.push(`   💡 ${isHome ? 'Avantage terrain favorable à l\'équipe à domicile.' : 'L\'équipe visiteuse semble en supériorité technique.'} Cote reflétant les rapports de force actuels.`);
    } else if (m.includes('total buts')) {
      const over = s.selection.toLowerCase().includes('plus');
      lignes.push(`   💡 ${over ? 'Match à caractère offensif attendu. Les deux équipes ont des attaques actives.' : 'Match fermé attendu. Défenses solides ou enjeux tactiques élevés.'}`);
    } else if (m.includes('deux équipes')) {
      const oui = s.selection.toLowerCase().includes('oui');
      lignes.push(`   💡 ${oui ? 'Les deux formations ont démontré une capacité offensive régulière.' : 'L\'une des équipes a tendance à verrouiller défensivement.'}`);
    } else if (m.includes('score exact')) {
      lignes.push(`   💡 Pari à cote élevée (${c.toFixed(2)}x). Score cohérent avec le rapport de force affiché. Mise prudente recommandée.`);
    } else if (m.includes('corners')) {
      const over = s.selection.toLowerCase().includes('plus');
      lignes.push(`   💡 ${over ? 'Match avec beaucoup de phases offensives et de centres attendus. Haute activité sur les ailes.' : 'Rencontre qui pourrait se jouer en contre ou avec peu de jeu côté.'}`);
    } else if (m.includes('tirs cadrés')) {
      lignes.push(`   💡 Indicateur de pression offensive. Une équipe dominante génère en moyenne 5-8 tirs cadrés.`);
    } else if (m.includes('fautes')) {
      const over = s.selection.toLowerCase().includes('plus');
      lignes.push(`   💡 ${over ? 'Match à l\'enjeu élevé, duels intenses attendus. Nombreuses fautes tactiques probables.' : 'Rencontre technique, arbitrage permissif ou équipes disciplinées.'}`);
    } else if (m.includes('hors-jeu')) {
      lignes.push(`   💡 Dépend de la stratégie défensive (ligne haute = plus de hors-jeu). Attaquants rapides peuvent générer des offside.`);
    } else if (m.includes('buts domicile') || m.includes('buts extérieur')) {
      lignes.push(`   💡 Pari individuel sur la productivité offensive d\'une équipe. Moins aléatoire qu\'un score exact.`);
    } else if (m.includes('double chance')) {
      lignes.push(`   💡 Pari de sécurité couvrant deux issues sur trois. Probabilité de réussite accrue.`);
    }
    lignes.push('');
  }

  // --- Analyse globale du combiné ---
  lignes.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lignes.push('📈 ÉVALUATION GLOBALE DU COMBINÉ\n');

  // Diversification des marchés
  const marchesUniques = [...new Set(selections.map(s => s.marche))];
  if (marchesUniques.length > 1) {
    lignes.push(`✅ Bon équilibre : ${marchesUniques.length} marchés différents (${marchesUniques.join(', ')}) = risque réparti`);
  } else {
    lignes.push(`ℹ️ Combiné mono-marché (${marchesUniques[0]}). Diversifiez pour réduire le risque systémique.`);
  }

  // Compétitions
  const comps = [...new Set(selections.map(s => s.competition).filter(Boolean))];
  if (comps.length > 1) lignes.push(`✅ Matchs issus de ${comps.length} compétitions différentes = exposition géographique diversifiée`);

  // Analyse des cotes individuelles
  const cotesMoyennes = selections.reduce((a, s) => a + parseFloat(s.cote), 0) / selections.length;
  lignes.push(`📊 Cote moyenne par sélection : ${cotesMoyennes.toFixed(2)}x (${cotesMoyennes < 1.7 ? 'prudent' : cotesMoyennes < 2.5 ? 'équilibré' : 'ambitieux'})`);
  lignes.push(`💰 Potentiel : ${coteTotal}x votre mise`);

  // Recommandation de mise
  lignes.push('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lignes.push('💼 RECOMMANDATION DE GESTION BANKROLL\n');
  const pctMise = coteTotal < 3 ? '5-8%' : coteTotal < 6 ? '3-5%' : coteTotal < 12 ? '1-3%' : '0.5-1%';
  lignes.push(`→ Mise conseillée : ${pctMise} de votre bankroll`);
  lignes.push(`→ Ne jamais miser plus de 10% sur un combiné, même favoris`);
  lignes.push(`→ Vérifier les absences et compositions officielles avant validation`);
  lignes.push(`→ Conditions météo à surveiller (match de plein air)`);

  if (coteTotal > 8) {
    lignes.push(`\n⚠️ Cote élevée (${coteTotal}x) : possibilité de scinder en 2 petits combinés indépendants.`);
  }

  lignes.push('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lignes.push('🤖 PRONOSAI PRO — Analyse algorithmique v2.0');
  lignes.push('💡 Ajoutez une clé Groq (gratuit) pour une analyse IA enrichie avec données récentes des équipes.');

  return lignes.join('\n');
}

async function analyserAvecIA(selections, coteTotal, cle, fournisseur) {
  if (!cle) {
    // Analyse algorithmique complète, pas juste un message vide
    return analyserSansIA(selections, coteTotal);
  }
  const liste = selections.map(s =>
    `• ${s.match} [${s.competition || 'Football'}] → ${s.marche} : ${s.selection} (cote ${s.cote})`
  ).join('\n');
  const detailsEquipes = selections.map(s => {
    const [dom, ext] = (s.match || '').split(' - ');
    const { nd, ne } = forceRelative(dom, ext);
    return `  - ${dom} (${nd}) vs ${ext} (${ne})`;
  }).join('\n');

  const prompt = `Tu es un expert senior en pronostics sportifs avec 15 ans d\'expérience. Analyse ce combiné de paris en français, de manière professionnelle et détaillée (200 mots minimum) :

SÉLECTIONS :
${liste}

NIVEAUX DES ÉQUIPES (estimés) :
${detailsEquipes}

COTE TOTALE : ${coteTotal}x

Donne une analyse structurée incluant :
1) Pour chaque match : analyse de l\'affrontement (forme récente supposée, blessés potentiels selon le niveau de l\'équipe, contexte compétitif)
2) Pertinence de chaque marché sélectionné
3) Risque global et niveau de confiance
4) Recommandation de mise (% bankroll)
5) Points de vigilance (météo, suspensions, motivation)

Sois précis, professionnel et factuel. Utilise des emojis pour la lisibilité.`;
  try {
    const url = fournisseur === 'groq' ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions';
    const model = fournisseur === 'groq' ? 'llama3-70b-8192' : 'gpt-3.5-turbo';
    const resp = await axios.post(url, {
      model, messages: [{ role: 'user', content: prompt }], max_tokens: 700, temperature: 0.65
    }, { headers: { 'Authorization': `Bearer ${cle}`, 'Content-Type': 'application/json' }, timeout: 20000 });
    return resp.data.choices[0].message.content;
  } catch (e) {
    // Fallback sur l'analyse algorithmique si l'IA échoue
    const errMsg = e.response?.data?.error?.message || e.message;
    console.log(`⚠️ [IA] Erreur (${errMsg}), fallback algorithme`);
    return analyserSansIA(selections, coteTotal);
  }
}

app.post('/pronostics', confirmedMiddleware, async (req, res) => {
  const { matchsSelectionnes, startDate, endDate, coteCible, marchesSelectionnes, cleIA, fournisseurIA } = req.body;
  if (!matchsSelectionnes?.length) return res.status(400).json({ error: 'Aucun match sélectionné' });

  // Validation de la cote cible
  const coteCibleValide = Math.max(1.5, Math.min(200, parseFloat(coteCible) || 3.0));

  const combines = genererCombines(matchsSelectionnes, marchesSelectionnes || ['Victoire'], coteCibleValide, 8);

  if (!combines.length)
    return res.json({ success: false, message: 'Aucun combiné trouvé avec les critères actuels. Réduisez la cote cible ou ajoutez des marchés. Toutes les cotes doivent être ≥ 1.20.' });

  // Trier par proximité avec la cote cible, puis par confiance
  const meilleurs = combines.sort((a, b) => {
    const diffA = Math.abs(a.coteTotal - coteCibleValide);
    const diffB = Math.abs(b.coteTotal - coteCibleValide);
    if (diffA !== diffB) return diffA - diffB;
    return b.confiance - a.confiance;
  });

  // Prendre le meilleur
  const meilleur = meilleurs[0];

  const analyse = await analyserAvecIA(meilleur.selections, meilleur.coteTotal, cleIA || '', fournisseurIA || 'groq');

  const prono = {
    id: genId(), user_id: req.user.id, username: req.user.username,
    startDate, endDate, coteCible: coteCibleValide,
    marchesSelectionnes: marchesSelectionnes || ['Victoire'],
    selections: meilleur.selections, coteTotal: meilleur.coteTotal,
    confiance: meilleur.confiance, analyseIA: analyse,
    statut_verification: 'en_attente', verifie_le: null,
    cree_le: new Date().toISOString()
  };
  const pronostics = readPronostics();
  pronostics.push(prono);
  writePronostics(pronostics);
  console.log(`🎯 [Pronostic] Créé par ${req.user.username}`);
  res.json({ success: true, data: prono });
});

app.get('/pronostics', confirmedMiddleware, (req, res) => {
  const pronostics = readPronostics();
  res.json({ pronostics: req.user.is_admin ? pronostics : pronostics.filter(p => p.user_id === req.user.id) });
});

app.delete('/pronostics/:id', confirmedMiddleware, (req, res) => {
  let pronostics = readPronostics();
  const p = pronostics.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Pronostic introuvable' });
  if (!req.user.is_admin && p.user_id !== req.user.id) return res.status(403).json({ error: 'Accès refusé' });
  writePronostics(pronostics.filter(x => x.id !== req.params.id));
  res.json({ success: true });
});

// ── Health ─────────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', env: NODE_ENV, uptime: process.uptime() }));

// ── Export ZIP (molo.zip) ─────────────────────────────────────────────────────
app.get('/admin/export-zip', adminMiddleware, (req, res) => {
  try {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip();
    const EXCLURE = new Set([
      'node_modules','.git','.cache','molo.zip','.local','.agents','.replit',
      'attached_assets','analyse-automatique-demo.png','demo-preview.png',
      'resultats-apres-analyse.png','ANALYSE_AUTOMATIQUE.md','DEPLOYMENT_GUIDE.md',
      'GUIDE_VISUEL_RÉSULTATS.md','PROJET_TERMINE.md','interaction.md','design.md',
      'render.yaml','aperçu-résultats.html','test-flux-automatique.html',
      'package-lock.json','main.js'
    ]);
    function ajouterDossier(dir, zipPath) {
      for (const entry of fs.readdirSync(dir)) {
        if (EXCLURE.has(entry)) continue;
        const full = path.join(dir, entry);
        if (fs.statSync(full).isDirectory()) ajouterDossier(full, zipPath ? `${zipPath}/${entry}` : entry);
        else zip.addLocalFile(full, zipPath || '');
      }
    }
    ajouterDossier(__dirname, '');
    const buf = zip.toBuffer();
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="molo.zip"');
    res.setHeader('Content-Length', buf.length);
    res.send(buf);
  } catch (e) {
    res.status(500).json({ error: 'Erreur ZIP : ' + e.message });
  }
});

// ── Statiques ─────────────────────────────────────────────────────────────────
app.use(express.static(__dirname));

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Serveur démarré sur http://0.0.0.0:${PORT}`);
});
initAdmin();
process.on('SIGTERM', () => server.close(() => process.exit(0)));

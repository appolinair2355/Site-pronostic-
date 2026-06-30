# PRONOSAI PRO

## Installation
```bash
npm install
npm start
```

## Accès admin
- **Identifiant** : `sossoukouam`
- **Mot de passe** : `arrow2026`

## Nouveautés de cette version corrigée

### ✅ Problèmes résolus
1. **Fichier `clients.js` manquant** → Créé avec toute la logique frontend
2. **Admin ne peut pas créer de pronostics** → Ajout d'un onglet "🎯 Créer un pronostic" dans l'interface admin
3. **Pas de champ pour la clé IA** → Ajout d'onglets "🤖 Clé IA" pour utilisateurs ET admin
4. **Admin bloqué par `confirmedMiddleware`** → L'admin est maintenant automatiquement considéré comme confirmé

### 🎯 Fonctionnalités
- Génération de pronostics combinés avec cotes
- Analyse IA (Groq/OpenAI) ou algorithme interne
- Sélection manuelle des matchs
- Gestion des utilisateurs (admin)
- Vérification des pronostics gagnés/perdus
- Export ZIP du projet
- Données en temps réel via ESPN & TheSportsDB

### 🤖 Clé IA
Obtenez une clé API gratuite sur [console.groq.com](https://console.groq.com/keys)
Sans clé, l'analyse utilise l'algorithme interne (moins détaillée mais fonctionnelle).

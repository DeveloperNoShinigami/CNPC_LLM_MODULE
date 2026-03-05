# CNPC_LLM_MODULE

> **A fully modular, pluggable AI framework for Minecraft Custom NPCs (CNPC) that connects Large Language Model "brains" to in-game characters.**

NPCs powered by this system have full awareness of their surroundings — time, weather, biome, health, nearby entities, loadout — and respond intelligently in two distinct conversation states.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Directory Structure](#directory-structure)
4. [Quick Start: One Script Per NPC](#quick-start-one-script-per-npc)
5. [Setup & Configuration](#setup--configuration)
6. [Supported AI Providers](#supported-ai-providers)
7. [Two-State NPC Conversation](#two-state-npc-conversation)
8. [Module Integration Guide](#module-integration-guide)
   - [TACZ Module — Roles](#tacz-module--roles)
   - [Epic Fight Module (Shell)](#epic-fight-module-shell)
   - [Iron's Spells Module (Shell)](#irons-spells-module-shell)
9. [The Master Loader (core/loader.js)](#the-master-loader-coreloaderjs)
10. [Creating a New Role](#creating-a-new-role)
11. [Pluggable Architecture: Adding Your Own Module](#pluggable-architecture-adding-your-own-module)
12. [Adding a New AI Provider](#adding-a-new-ai-provider)
13. [API Reference](#api-reference)
14. [CNPC ES5 Scripting Standard](#cnpc-es5-scripting-standard)
15. [FAQ](#faq)

---

## Overview

`CNPC_LLM_MODULE` is a drop-in scripting framework for the [Custom NPCs mod](https://www.curseforge.com/minecraft/mc-mods/custom-npcs) that routes NPC interaction events to a real LLM API (Google Gemini, OpenRouter, or any compatible endpoint).

**Key features:**

- **One script per NPC** — assign a single role script (e.g. `roles/squad_leader.js`) to an NPC in CNPC and everything is loaded automatically via `load()`.
- **Role-based NPC identity** — roles live in `modules/<mod>/roles/` and define persona, goals, and preferred AI provider independently.
- **Module-agnostic core** — the same AI plumbing works for any mod integration (TACZ, Epic Fight, Iron's Spells, or your own).
- **Pluggable provider system** — swap between Gemini, OpenRouter (GPT-4o, Claude, Mistral, Llama …) by changing one value in the role config.
- **Full game-state awareness** — every prompt includes time, weather, biome, NPC health & loadout, player state, and nearby entities.
- **Two-state conversation** — NPCs move from a brief ACK to a full multi-turn dialogue, then back to idle on dismissal.
- **CNPC ES5 scripting standard** — all code runs in CNPC's Rhino JavaScript engine with Java interop for HTTP and file I/O.

---

## Architecture

```
NPC assigned role script: modules/tacz/roles/squad_leader.js
        │
        │  load(LLM_BASE_PATH + "/core/loader.js")   ← single load() call
        ▼
[loader.js] — chains ALL files in correct order via load(), then calls:
              AIManager.init()  +  TACZConnector.init()
        │
        ▼  (CNPC fires interact() event)
[Role Script: squad_leader.js]
  • Reads NPC entity, player, world state from CNPC API
  • Calls TACZConnector.handleRoleInteraction(SQUAD_LEADER_ROLE, entityId, context, msg, cb)
        │
        ▼
[TACZConnector.handleRoleInteraction()]
  • Attaches goals (GoalsLoader) + roleId to context
  • Calls AIManager.interact(moduleId, entityId, providerName, context, msg, cb)
        │
        ▼
[AIManager]
  • Checks TalkManager for IDLE / LISTENING state
  • Selects model brain from ModelBrainRegistry (keyed by "tacz:gemini" etc.)
  • Calls BrainFactory → brain instance
        │
        ▼
[model_brain.buildSystemPrompt(context, mode)]
  • Picks role persona (squad_leader / soldier / rifleman …)
  • Builds full system prompt including goals block
        │
        ▼
[GeminiBrain / OpenRouterBrain]  (via java.lang.Thread)
  • HTTP POST to AI API
  • callback(null, responseText)
        │
        ▼
Role script: event.npc.say(response)
```

---

## Directory Structure

```
CNPC_LLM_MODULE/
├── core/
│   ├── loader.js                  ★ MASTER LOADER — load this first via load()
│   ├── ai_manager.js              Master AI router + ModelBrainRegistry
│   ├── brain_factory.js           Instantiates AI provider brains
│   ├── brain_registry.js          Maps entity IDs to brain instances
│   ├── gemini_brain.js            Google Gemini API wrapper
│   ├── openrouter_brain.js        OpenRouter API wrapper
│   ├── master_config.json         GLOBAL CONFIG — providers, modules, talk settings
│   │
│   ├── tacz_models/
│   │   ├── gemini/model_brain.js     Role-aware Gemini prompts for TACZ
│   │   └── openrouter/model_brain.js Role-aware OpenRouter prompts for TACZ
│   │
│   ├── ef_models/
│   │   └── gemini/model_brain.js     Gemini prompts for Epic Fight NPCs
│   │
│   └── irons_models/
│       └── gemini/model_brain.js     Gemini prompts for Iron's Spells NPCs
│
├── modules/
│   ├── tacz/
│   │   ├── roles/                 ★ ONE SCRIPT PER NPC ROLE
│   │   │   ├── squad_leader.js    → assign to Squad Leader NPCs in CNPC
│   │   │   └── soldier.js         → assign to Soldier NPCs in CNPC
│   │   ├── tacz_connector.js      TACZ ↔ Core bridge
│   │   ├── tacz_config.json       Role definitions (managed here)
│   │   └── utils/
│   │       ├── context_builder.js Normalises raw game data → context object
│   │       ├── goals_loader.js    Loads NPC goal sets from config
│   │       └── loadout_manager.js Manages per-NPC weapon/armour loadouts
│   │
│   ├── epic_fight/
│   │   ├── epic_fight_connector.js  (shell)
│   │   └── epic_fight_config.json
│   │
│   └── irons_spells/
│       ├── irons_connector.js       (shell)
│       └── irons_config.json
│
├── npc_talk/
│   ├── talk_manager.js            IDLE ↔ LISTENING state machine
│   ├── session_store.js           In-memory conversation history
│   └── interaction_logic.js       Order / closing-phrase detection
│
└── README.md
```

---

## Quick Start: One Script Per NPC

The entire system is designed so you **only assign one file to each NPC** in CNPC.

### Step 1 — Place the framework on your server

Copy the `CNPC_LLM_MODULE` folder into your CNPC scripts directory.
The default path is `scripts/LLM_MODULE/` relative to your server root.

### Step 2 — Set your API key

Open `core/master_config.json` and set `brain_providers.gemini.api_key`.

### Step 3 — Assign a role script to your NPC

In the CNPC NPC editor, set the NPC's script to:
```
scripts/LLM_MODULE/modules/tacz/roles/squad_leader.js
```
or
```
scripts/LLM_MODULE/modules/tacz/roles/soldier.js
```

That is all. When the NPC loads, the role script calls `load(LLM_BASE_PATH + "/core/loader.js")` which chains every required file and initialises the full system automatically.

### Step 4 — Right-click the NPC in-game

The NPC will acknowledge you (IDLE → LISTENING) and you can begin conversing.

> **Note:** If you placed the framework in a different folder than `scripts/LLM_MODULE`, edit the `LLM_BASE_PATH` line near the top of each role script.

---

## Setup & Configuration

### Edit `core/master_config.json`

```json
{
  "default_brain": "gemini",
  "brain_providers": {
    "gemini": {
      "api_key": "YOUR_GEMINI_API_KEY",
      "model": "gemini-1.5-flash",
      "temperature": 0.85,
      "max_output_tokens": 512
    },
    "openrouter": {
      "api_key": "YOUR_OPENROUTER_API_KEY",
      "model": "openai/gpt-4o-mini",
      "temperature": 0.85,
      "max_tokens": 512
    }
  },
  "modules": {
    "tacz":        { "enabled": true,  "config_path": "./modules/tacz/tacz_config.json" },
    "epic_fight":  { "enabled": false, "config_path": "./modules/epic_fight/epic_fight_config.json" },
    "irons_spells":{ "enabled": false, "config_path": "./modules/irons_spells/irons_config.json" }
  }
}
```

---

## Supported AI Providers

| Provider key  | File                       | Description |
|---------------|----------------------------|-------------|
| `gemini`      | `core/gemini_brain.js`     | Google Gemini 1.5 Flash / Pro via REST API |
| `openrouter`  | `core/openrouter_brain.js` | OpenRouter — access GPT-4o, Claude, Mistral, Llama 3, etc. |

To use OpenRouter for a role, set `brainProvider: "openrouter"` inside the role script (e.g. in `SQUAD_LEADER_ROLE.brainProvider`) and ensure your key is in `master_config.json`.

---

## Two-State NPC Conversation

### State 1 — IDLE (Acknowledgment)

**Trigger:** Player right-clicks the NPC (empty `playerMsg`).

**Response:** A single short acknowledgment line (max ~15 words) in the NPC's role voice.

**Examples:**
- *Squad Leader:* "All units report. What's your status, soldier?"
- *Soldier:* "Eyes forward. Ready for orders."

The NPC immediately transitions to **LISTENING**.

### State 2 — LISTENING (Natural Conversation)

The player can now speak naturally. The AI is fully aware of the game state and references it organically.

**Giving orders:**
```
Alpha, fall back to the checkpoint.
Ghost, take position on the ridge and hold.
```

**General conversation:**
```
What's the situation to the north?
How much ammo do you have left?
```

**Ending the conversation** (any closing phrase from `master_config.json`):
```
That is all, Alpha.
Dismissed.
At ease.
```

The NPC delivers a closing sign-off and returns to **IDLE**. Conversation history is cleared.

**Idle timeout:** If no message is sent within `talk_settings.idle_timeout_ms` (default 30 s), the session auto-resets to IDLE. Call `AIManager.tick()` from a timer NPC script to enforce this.

---

## Module Integration Guide

### TACZ Module — Roles

The TACZ module uses the `modules/tacz/roles/` folder for NPC assignment.

**Available roles:**

| Role script | roleId | Persona | Default goals |
|---|---|---|---|
| `roles/squad_leader.js` | `squad_leader` | Authoritative commander; leads the squad and coordinates tactics | patrol, engage, report, coordinate_squad |
| `roles/soldier.js`      | `soldier`      | Disciplined trooper; executes orders and engages threats on sight | patrol, engage, follow_player_on_order, suppress |

**Assigning a role:** In CNPC's NPC editor, set the NPC's script path to the role file.  No config changes are needed.

**Switching AI provider per NPC:** Open the role script and change `brainProvider`:
```javascript
var SQUAD_LEADER_ROLE = {
  roleId:        "squad_leader",
  moduleId:      "tacz",
  brainProvider: "openrouter"   // ← switch to OpenRouter for this NPC
}
```

**Setting a loadout:**
```javascript
// In a separate NPC init script or the role script's init() hook:
LoadoutManager.set("npc_entity_123", {
  primary:     "M4A1",
  secondary:   "Glock 17",
  melee:       "Combat Knife",
  armour:      "Kevlar Vest",
  attachments: ["Red Dot", "Suppressor"]
})
```

---

### Epic Fight Module (Shell)

Located at `modules/epic_fight/`. Contains a working connector shell.

**To fully implement:**
1. Add `modules/epic_fight/roles/warrior.js` following the pattern of `tacz/roles/soldier.js`.
2. Read Epic Fight weapon data from the CNPC/Epic Fight API; populate `context.npc.equipment`.
3. Set `"enabled": true` in `master_config.json`.

---

### Iron's Spells Module (Shell)

Located at `modules/irons_spells/`. Contains a working connector shell.

**To fully implement:**
1. Add `modules/irons_spells/roles/arcanist.js` following the role-script pattern.
2. Read active spells and mana from the Iron's Spells API; populate `context.npc.equipment`.
3. Set `"enabled": true` in `master_config.json`.

---

## The Master Loader (`core/loader.js`)

`loader.js` is the single entry-point that chains every required file via Rhino's `load()` function and then calls `AIManager.init()` and `TACZConnector.init()`.

A guard variable (`LLM_SYSTEM_LOADED`) ensures the entire chain runs **only once** per server session, even when many NPCs each have a role script that calls `load(".../loader.js")`.

### Requirements

Set `LLM_BASE_PATH` to the absolute (or server-root-relative) path of the framework folder **before** calling `load()`:

```javascript
// At the top of a role script or a global CNPC server script:
var LLM_BASE_PATH = "scripts/LLM_MODULE"    // adjust to your server layout
load(LLM_BASE_PATH + "/core/loader.js")
```

### What loader.js loads (in order)

```
core/gemini_brain.js
core/openrouter_brain.js
core/brain_factory.js
core/brain_registry.js
core/ai_manager.js                        ← also defines ModelBrainRegistry inline
core/tacz_models/gemini/model_brain.js    ← self-registers with ModelBrainRegistry
core/tacz_models/openrouter/model_brain.js
core/ef_models/gemini/model_brain.js
core/irons_models/gemini/model_brain.js
npc_talk/session_store.js
npc_talk/talk_manager.js
npc_talk/interaction_logic.js
modules/tacz/utils/context_builder.js
modules/tacz/utils/loadout_manager.js
modules/tacz/utils/goals_loader.js
modules/tacz/tacz_connector.js
```

Then it calls:
```javascript
AIManager.init(LLM_BASE_PATH + "/core/master_config.json")
TACZConnector.init(LLM_BASE_PATH + "/modules/tacz/tacz_config.json")
```

---

## Creating a New Role

To add a new TACZ role (e.g. `medic`):

### 1 — Add the role to `modules/tacz/tacz_config.json`

```json
"medic": {
  "description": "Combat medic. Prioritises healing allies and evacuating casualties.",
  "brain_provider": "gemini",
  "goals": ["resupply_allies", "hold_position", "report_contacts"]
}
```

### 2 — Create `modules/tacz/roles/medic.js`

Copy `soldier.js` as a template and change:
```javascript
var MEDIC_ROLE = {
  roleId:        "medic",
  moduleId:      "tacz",
  brainProvider: "gemini",
  defaultTask:   "treating casualties"
}
```
Update the `init`, `interact`, and `removed` function names/log messages.

### 3 — Add a persona in the model brains

In both `core/tacz_models/gemini/model_brain.js` and `core/tacz_models/openrouter/model_brain.js`, add an entry to `_ROLE_PERSONAS`:

```javascript
"medic": {
  title:       "Combat Medic",
  tone:        "calm and focused under fire — you prioritise keeping your squad alive above all else",
  defaultTask: "treating casualties"
}
```

### 4 — Assign the script in CNPC

Set the NPC's script to `scripts/LLM_MODULE/modules/tacz/roles/medic.js`.

---

## Pluggable Architecture: Adding Your Own Module

1. **Create the connector:**
   ```
   modules/my_mod/my_mod_connector.js
   modules/my_mod/my_mod_config.json
   ```

2. **Create the model brain:**
   ```
   core/my_mod_models/gemini/model_brain.js
   ```
   Self-register at the bottom:
   ```javascript
   ModelBrainRegistry.register("my_mod", "gemini", {
     brainProvider: "gemini",
     buildSystemPrompt: buildSystemPrompt
   })
   ```

3. **Create role scripts:**
   ```
   modules/my_mod/roles/my_role.js
   ```
   Follow the pattern in `modules/tacz/roles/soldier.js`:
   - Set `LLM_BASE_PATH` + call `load(LLM_BASE_PATH + "/core/loader.js")`
   - Define `MY_ROLE` config object
   - Implement CNPC event hooks (`init`, `interact`, `removed`)
   - Call `MyModConnector.handleRoleInteraction(MY_ROLE, entityId, context, msg, cb)`

4. **Add your files to `core/loader.js`:**
   Add `load()` calls for your model brain and connector, and call `MyModConnector.init(...)`.

5. **Add to `core/master_config.json`:**
   ```json
   "my_mod": {
     "enabled": true,
     "config_path": "./modules/my_mod/my_mod_config.json"
   }
   ```

---

## Adding a New AI Provider

1. **Create the brain wrapper** (e.g. `core/llama_brain.js`):
   ```javascript
   var LlamaBrain = (function() {
     function LlamaBrainInstance(config) {
       this.endpoint = config.endpoint || "http://localhost:11434/api/generate"
       this.model    = config.model || "llama3"
     }
     LlamaBrainInstance.prototype.think = function(systemPrompt, userMessage, callback) {
       // ... Java HTTP + Thread implementation
     }
     LlamaBrainInstance.prototype.thinkWithHistory = function(systemPrompt, history, userMessage, callback) {
       // ... Java HTTP + Thread implementation
     }
     return { create: function(config) { return new LlamaBrainInstance(config) } }
   })()
   ```

2. **Register it** (after loading the file, before AIManager.init()):
   ```javascript
   BrainFactory.register("llama", LlamaBrain)
   ```

3. **Add to `master_config.json`:**
   ```json
   "llama": {
     "endpoint": "http://localhost:11434/api/generate",
     "model": "llama3",
     "temperature": 0.85,
     "max_tokens": 512
   }
   ```

4. Set `"brain_provider": "llama"` in any role config that should use it.

---

## API Reference

### AIManager

| Method | Description |
|--------|-------------|
| `AIManager.init(configPath)` | Load master_config.json, initialise all brains. Call once. |
| `AIManager.interact(moduleId, entityId, providerName, context, playerMsg, callback)` | Main interaction entry point. callback: `(err, responseText)`. |
| `AIManager.registerModule(moduleId, connector)` | Register a connector at runtime. |
| `AIManager.resetSession(entityId)` | Clear session and brain cache for an NPC (on death/despawn). |
| `AIManager.tick()` | Evict idle sessions (call every ~10 s). |
| `AIManager.getConfig()` | Return the loaded master config object. |

### TalkManager

| Method | Description |
|--------|-------------|
| `TalkManager.getState(entityId)` | Returns `"IDLE"` or `"LISTENING"`. |
| `TalkManager.transition(entityId, newState)` | Change state; clears history when going to IDLE. |
| `TalkManager.addTurn(entityId, role, text)` | Append a turn to history (role: `"user"` or `"model"`). |
| `TalkManager.getHistory(entityId)` | Returns array of `{role, parts:[{text}]}` objects. |
| `TalkManager.onNPCRemoved(entityId)` | Remove session on NPC removal. |
| `TalkManager.tick()` | Evict timed-out sessions; returns array of evicted IDs. |

### LoadoutManager (TACZ)

| Method | Description |
|--------|-------------|
| `LoadoutManager.set(entityId, loadout)` | Set full loadout (`primary`, `secondary`, `melee`, `armour`, `attachments`, `ammo`). |
| `LoadoutManager.get(entityId)` | Get current loadout. |
| `LoadoutManager.update(entityId, patch)` | Update individual loadout fields. |
| `LoadoutManager.remove(entityId)` | Remove loadout on NPC removal. |
| `LoadoutManager.toEquipmentArray(entityId)` | Returns `string[]` for `context.npc.equipment`. |

### InteractionLogic

| Method | Description |
|--------|-------------|
| `InteractionLogic.parse(message, npcName, closingPhrases)` | Returns `{type, text, rawMessage}` where type is `"ORDER"`, `"CLOSING"`, or `"CONVERSATION"`. |
| `InteractionLogic.isOrder(message, npcName)` | True if message follows `"<name>, <command>"` pattern. |
| `InteractionLogic.isClosingPhrase(message, phrases)` | True if message contains a dismissal phrase. |
| `InteractionLogic.normalise(message, maxLength)` | Trim, collapse whitespace, truncate. |

---

## CNPC ES5 Scripting Standard

All scripts in this framework follow the **CNPC ES5 scripting standard** required by Custom NPCs' Rhino JavaScript engine:

| Rule | Details |
|------|---------|
| **No semicolons** | Statements end without `;` (ASI handles termination) |
| **Function declarations** | Use `function foo() {}` or `var foo = function() {}`. No arrow functions (`=>`). No `class` syntax. |
| **No module system** | No `require()`, `import`, or `export`. All files contribute to a shared global scope. |
| **Java interop for I/O** | Use `java.net.URL`, `java.net.HttpURLConnection`, `java.io.*` for HTTP and file operations. |
| **Thread-based async** | Use `new java.lang.Thread(new java.lang.Runnable({ run: function() {...} }))` for non-blocking API calls. |
| **`var` only** | No `let` or `const`. |
| **No null coalescing** | Use `val !== undefined ? val : default` instead of `??`. |
| **No template literals** | Use string concatenation `"hello " + name` instead of `` `hello ${name}` ``. |

---

## FAQ

**Q: Where do I put my API key?**
In `core/master_config.json` under `brain_providers.gemini.api_key` (or `openrouter.api_key`). Never commit keys to version control.

**Q: How do I assign a role to an NPC?**
In CNPC's NPC editor, set the NPC's **script** to the role file (e.g. `scripts/LLM_MODULE/modules/tacz/roles/squad_leader.js`). That script loads the entire system automatically. No config file edits are needed.

**Q: How do I give a specific NPC a different AI provider?**
Open the role script (e.g. `soldier.js`) and change `brainProvider` in the role config object at the top of the file:
```javascript
var SOLDIER_ROLE = {
  roleId:        "soldier",
  moduleId:      "tacz",
  brainProvider: "openrouter"   // ← changed from "gemini"
}
```
If you want different NPCs of the same role to use different providers, duplicate the role script (e.g. `soldier_openrouter.js`) and change the `brainProvider` there.

**Q: How do I change what an NPC says?**
Edit the persona and mode-instructions in `core/[modname]_models/[provider]/model_brain.js`. The `_ROLE_PERSONAS` table controls each role's tone and title. The `_getModeInstructions()` function controls ACK / LISTENING / CLOSING response style.

**Q: LLM_BASE_PATH — what should it be?**
It should be the path from your Minecraft server's working directory to the root of `CNPC_LLM_MODULE`. If you placed it in `<server>/scripts/LLM_MODULE/`, use `"scripts/LLM_MODULE"`. If you used an absolute path, use the full path.

**Q: Can I use a locally-hosted model?**
Yes. Create a new brain wrapper that posts to your local endpoint (e.g. Ollama at `http://localhost:11434`). Register it with `BrainFactory.register("ollama", OllamaBrain)` and add it to `master_config.json`. Then set `brainProvider: "ollama"` in any role script.

**Q: The NPC doesn't respond — what do I check?**
1. Check `LLM_LOG` output for any error from `loader.js` or the brain HTTP call.
2. Confirm `LLM_BASE_PATH` is correct in the role script.
3. Verify your API key is set in `master_config.json`.
4. Ensure the network is reachable from the server (Gemini / OpenRouter are external APIs).
 

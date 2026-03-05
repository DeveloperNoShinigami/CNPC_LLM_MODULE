# CNPC_LLM_MODULE

> **A fully modular, pluggable AI framework for Minecraft Custom NPCs (CNPC) that connects Large Language Model "brains" to in-game characters.**

NPCs powered by this system have full awareness of their surroundings — time, weather, biome, health, nearby entities, loadout — and respond intelligently in two distinct conversation states.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Directory Structure](#directory-structure)
4. [Setup & Configuration](#setup--configuration)
5. [Supported AI Providers](#supported-ai-providers)
6. [Two-State NPC Conversation](#two-state-npc-conversation)
7. [Module Integration Guide](#module-integration-guide)
   - [TACZ Module](#tacz-module)
   - [Epic Fight Module (Shell)](#epic-fight-module-shell)
   - [Iron's Spells Module (Shell)](#irons-spells-module-shell)
8. [Script Load Order](#script-load-order)
9. [Pluggable Architecture: Adding Your Own Module](#pluggable-architecture-adding-your-own-module)
10. [Adding a New AI Provider](#adding-a-new-ai-provider)
11. [API Reference](#api-reference)
12. [CNPC ES5 Scripting Standard](#cnpc-es5-scripting-standard)
13. [FAQ](#faq)

---

## Overview

`CNPC_LLM_MODULE` is a drop-in scripting framework for the [Custom NPCs mod](https://www.curseforge.com/minecraft/mc-mods/custom-npcs) that routes NPC interaction events to a real LLM API (Google Gemini, OpenRouter, or any compatible endpoint).

**Key features:**

- **Module-agnostic core** — the same AI plumbing works for any mod integration (TACZ, Epic Fight, Iron's Spells, or your own).
- **Pluggable provider system** — swap between Gemini, OpenRouter (GPT-4o, Claude, Mistral, Llama …) by changing one config value.
- **Full game-state awareness** — every prompt includes time, weather, biome, NPC health & loadout, player state, and nearby entities.
- **Two-state conversation** — NPCs move from a brief military-style ACK to a full multi-turn dialogue, then back to idle on dismissal.
- **CNPC ES5 scripting standard** — all code runs in CNPC's Rhino JavaScript engine with Java interop for HTTP and file I/O.

---

## Architecture

```
Player right-clicks NPC
        │
        ▼
[Connector] (e.g. TACZConnector)
  • Reads NPC entity ID, player message, raw game data
  • Resolves role & AI provider from module config
  • Builds game-state context (ContextBuilder)
  • Enriches with loadout (LoadoutManager)
        │
        ▼
[AIManager.interact()]
  • Checks TalkManager for IDLE / LISTENING state
  • Selects the correct model brain from ModelBrainRegistry
  • Calls BrainFactory.create() → brain instance
        │
        ▼
[model_brain.buildSystemPrompt(context, mode)]
  • Builds full persona + world-state system prompt
        │
        ▼
[GeminiBrain / OpenRouterBrain]  (via java.lang.Thread)
  • HTTP POST to AI API
  • Returns response text via callback
        │
        ▼
[TalkManager] — stores turn history, manages IDLE/LISTENING
        │
        ▼
Response text delivered back to caller
```

---

## Directory Structure

```
CNPC_LLM_MODULE/
├── core/
│   ├── ai_manager.js              MASTER AI MANAGER — global entry point
│   ├── brain_factory.js           Instantiates AI provider brains
│   ├── brain_registry.js          Maps entity IDs to brain instances
│   ├── gemini_brain.js            Google Gemini API wrapper
│   ├── openrouter_brain.js        OpenRouter API wrapper
│   ├── master_config.json         GLOBAL CONFIG — providers, modules, talk settings
│   │
│   ├── tacz_models/
│   │   ├── gemini/model_brain.js     Gemini prompt logic for TACZ NPCs
│   │   └── openrouter/model_brain.js OpenRouter prompt logic for TACZ NPCs
│   │
│   ├── ef_models/
│   │   └── gemini/model_brain.js     Gemini prompt logic for Epic Fight NPCs
│   │
│   └── irons_models/
│       └── gemini/model_brain.js     Gemini prompt logic for Iron's Spells NPCs
│
├── modules/
│   ├── tacz/
│   │   ├── tacz_connector.js         TACZ ↔ Core bridge
│   │   ├── tacz_config.json          Role definitions & NPC assignments
│   │   └── utils/
│   │       ├── context_builder.js    Normalises raw game data → context object
│   │       ├── goals_loader.js       Loads NPC goal sets from config
│   │       └── loadout_manager.js    Manages per-NPC weapon/armour loadouts
│   │
│   ├── epic_fight/
│   │   ├── epic_fight_connector.js   Epic Fight ↔ Core bridge (shell)
│   │   └── epic_fight_config.json
│   │
│   └── irons_spells/
│       ├── irons_connector.js        Iron's Spells ↔ Core bridge (shell)
│       └── irons_config.json
│
├── npc_talk/
│   ├── talk_manager.js              IDLE ↔ LISTENING state machine
│   ├── session_store.js             In-memory conversation history
│   └── interaction_logic.js        Order / closing-phrase detection
│
└── README.md
```

---

## Setup & Configuration

### 1. Edit `core/master_config.json`

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

Replace `YOUR_GEMINI_API_KEY` with your [Google AI Studio](https://aistudio.google.com/app/apikey) key.
Replace `YOUR_OPENROUTER_API_KEY` with your [OpenRouter](https://openrouter.ai/keys) key.

### 2. Assign NPCs in the module config

Open `modules/tacz/tacz_config.json` and add your NPC entity IDs:

```json
"npc_assignments": {
  "npc_entity_123": { "role": "rifleman", "name": "Alpha" },
  "npc_entity_456": { "role": "sniper",   "name": "Ghost" }
}
```

### 3. Load the scripts in CNPC

See [Script Load Order](#script-load-order) below.

---

## Supported AI Providers

| Provider key  | File                     | Description |
|---------------|--------------------------|-------------|
| `gemini`      | `core/gemini_brain.js`   | Google Gemini 1.5 Flash / Pro via REST API |
| `openrouter`  | `core/openrouter_brain.js` | OpenRouter — access GPT-4o, Claude, Mistral, Llama 3, etc. |

To switch a module to OpenRouter, set `"brain_provider": "openrouter"` in the role's config entry and ensure your key is in `master_config.json`.

---

## Two-State NPC Conversation

### State 1 — IDLE (Acknowledgment)

**Trigger:** Player right-clicks the NPC (empty `playerMsg`).

**Response:** A single short acknowledgment line (max ~15 words) signalling the NPC is alert and listening.

**Example:** *"Eyes up. Alpha copies — what do you need?"*

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

### TACZ Module

The primary reference implementation.

**Files:**
- `modules/tacz/tacz_connector.js` — event bridge
- `modules/tacz/tacz_config.json` — roles and NPC assignments
- `modules/tacz/utils/context_builder.js` — game-state normaliser
- `modules/tacz/utils/loadout_manager.js` — per-NPC weapon tracking
- `modules/tacz/utils/goals_loader.js` — goal-set loader

**Roles:**

| Role      | Description |
|-----------|-------------|
| `rifleman` | Standard infantry; patrols and engages hostiles |
| `sniper`   | Long-range specialist; holds position, priority targets |
| `support`  | Heavy weapons; suppresses enemies, resupplies allies |

**Setting a loadout at runtime:**
```javascript
LoadoutManager.set("npc_entity_123", {
  primary:     "M4A1",
  secondary:   "Glock 17",
  melee:       "Combat Knife",
  armour:      "Kevlar Vest",
  attachments: ["Red Dot", "Suppressor"]
})
```

**Triggering an interaction from an NPC script:**
```javascript
TACZConnector.onNPCInteract({
  entityId:   npc.getUUID(),
  npcName:    npc.getName(),
  playerMsg:  event.message || "",
  npcRawData: { health: npc.getHealth(), maxHealth: npc.getMaxHealth(), equipment: [] },
  playerData: { name: player.getName(), health: player.getHealth() },
  worldData:  { time: world.getTotalWorldTime(), biome: world.getBiomeName() },
  nearbyData: { hostiles: [], friendlies: [] }
}, function(err, response) {
  if (err) { LLM_LOG("Error: " + err); return }
  npc.say(response)
})
```

---

### Epic Fight Module (Shell)

Located at `modules/epic_fight/`. Contains a working connector shell.

**To fully implement:**
1. Read Epic Fight combat data (weapon combo, stamina, etc.) from the CNPC/Epic Fight API.
2. Populate `context.npc.equipment` with the NPC's weapons and fighting style.
3. Set `"enabled": true` in `master_config.json`.
4. Call `EpicFightConnector.init("<path>/modules/epic_fight/epic_fight_config.json")` at startup.

---

### Iron's Spells Module (Shell)

Located at `modules/irons_spells/`. Contains a working connector shell.

**To fully implement:**
1. Read active spells and mana from the Iron's Spells NPC data.
2. Populate `context.npc.equipment` with the list of active spell names.
3. Set `"enabled": true` in `master_config.json`.
4. Call `IronsSpellsConnector.init("<path>/modules/irons_spells/irons_config.json")` at startup.

---

## Script Load Order

All files must be loaded in order before any NPC events fire. Place these calls in your CNPC server startup script or NPC `init` event:

```
1.  core/gemini_brain.js
2.  core/openrouter_brain.js          (optional — only if using OpenRouter)
3.  core/brain_factory.js
4.  core/brain_registry.js
5.  core/ai_manager.js                (also defines ModelBrainRegistry)
6.  core/tacz_models/gemini/model_brain.js
7.  core/tacz_models/openrouter/model_brain.js  (optional)
8.  core/ef_models/gemini/model_brain.js        (optional)
9.  core/irons_models/gemini/model_brain.js     (optional)
10. npc_talk/session_store.js
11. npc_talk/talk_manager.js
12. npc_talk/interaction_logic.js
13. modules/tacz/utils/context_builder.js
14. modules/tacz/utils/loadout_manager.js
15. modules/tacz/utils/goals_loader.js
16. modules/tacz/tacz_connector.js
17. modules/epic_fight/epic_fight_connector.js  (optional)
18. modules/irons_spells/irons_connector.js     (optional)
```

Then call once:
```javascript
AIManager.init("<absolute_path>/core/master_config.json")
TACZConnector.init("<absolute_path>/modules/tacz/tacz_config.json")
// ... other enabled connectors
```

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
   At the bottom of your model brain file, self-register:
   ```javascript
   ModelBrainRegistry.register("my_mod", "gemini", {
     brainProvider: "gemini",
     buildSystemPrompt: buildSystemPrompt
   })
   ```

3. **Add to `master_config.json`:**
   ```json
   "my_mod": {
     "enabled": true,
     "config_path": "./modules/my_mod/my_mod_config.json"
   }
   ```

4. **Load your files** in the correct order (see above) and call:
   ```javascript
   AIManager.registerModule("my_mod", MyModConnector)
   ```

That is all. The AI Manager will automatically route `my_mod` NPC events to your connector and brain.

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

**Q: How do I add a new NPC?**
In the relevant module config (e.g. `tacz_config.json`), add an entry to `npc_assignments` mapping the NPC's entity ID to a role.

**Q: How do I change what an NPC says?**
Edit the `buildSystemPrompt` function in `core/[modname]_models/[provider]/model_brain.js`. Adjust the `basePersona` block to change personality, or the `_getModeInstructions` block to change response style.

**Q: Can I use a locally-hosted model?**
Yes. Create a new brain wrapper that posts to your local endpoint (e.g. Ollama at `http://localhost:11434`). Register it with `BrainFactory.register("ollama", OllamaBrain)` and add it to `master_config.json`.

**Q: The NPC doesn't respond — what do I check?**
1. Confirm `AIManager.init()` has been called with the correct config path.
2. Confirm the module connector `init()` was called.
3. Confirm the correct `model_brain.js` file was loaded and self-registered.
4. Check `LLM_LOG` output for error messages.
5. Verify your API key is valid and the network is reachable from the server.
 

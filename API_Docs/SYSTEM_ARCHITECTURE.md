# LLM_MODULE System Architecture

> **Runtime:** Rhino JavaScript Engine (ES5, CustomNPCs 1.20.1)  
> **Path convention:** All `load()` calls use `NpcAPI.getLevelDir()` as the root anchor.

---

## Directory Layout

```
<world>/scripts/ecmascript/LLM_MODULE/
│
├── core/                              ← Core AI infrastructure
│   ├── loader.js                      ← SINGLE entry point; chains every file via load()
│   ├── ai_manager.js                  ← Routes NPC events → model brains
│   ├── brain_factory.js               ← Instantiates brain providers
│   ├── brain_registry.js              ← entityId → {moduleId, role} mapping
│   ├── gemini_brain.js                ← Google Gemini HTTP wrapper
│   ├── openrouter_brain.js            ← OpenRouter HTTP wrapper
│   ├── master_config.json             ← API keys, provider config, talk settings
│   ├── tacz_models/
│   │   ├── gemini/model_brain.js      ← TACZ Gemini system-prompt builder
│   │   └── openrouter/model_brain.js  ← TACZ OpenRouter system-prompt builder
│   ├── ef_models/
│   │   └── gemini/model_brain.js      ← Epic Fight brain
│   └── irons_models/
│       └── gemini/model_brain.js      ← Iron's Spells brain
│
├── npc_talk/                          ← Conversation state machine
│   ├── session_store.js               ← Per-entity IDLE/LISTENING + history
│   ├── talk_manager.js                ← State transitions + idle timeout
│   └── interaction_logic.js          ← Closing-phrase detection
│
├── modules/
│   ├── tacz/                          ← Timeless and Classics Zero module
│   │   ├── tacz_config.json           ← Role definitions + default loadouts
│   │   ├── tacz_connector.js          ← Bridge: CNPC events → AIManager
│   │   ├── ai_goals/                  ← ★ Individual goal files (load what you need)
│   │   │   ├── patrol.js
│   │   │   ├── engage_hostiles.js
│   │   │   ├── hold_position.js
│   │   │   ├── engage_priority_targets.js
│   │   │   ├── report_contacts.js
│   │   │   ├── suppress_hostiles.js
│   │   │   ├── resupply_allies.js
│   │   │   ├── secure_area.js
│   │   │   ├── coordinate_squad.js
│   │   │   ├── follow_player_on_order.js
│   │   │   ├── treat_wounded.js
│   │   │   ├── fire_support.js
│   │   │   ├── scout_area.js
│   │   │   ├── follow_leader_formation.js
│   │   │   ├── maintain_formation.js
│   │   │   └── relay_orders.js
│   │   ├── roles/                     ← One script per NPC role (assign in CNPC editor)
│   │   │   ├── squad_leader.js
│   │   │   ├── soldier.js
│   │   │   ├── sniper.js
│   │   │   ├── medic.js
│   │   │   ├── launcher.js
│   │   │   └── scout.js
│   │   └── utils/
│   │       ├── context_builder.js     ← Normalises raw CNPC data → context object
│   │       ├── loadout_manager.js     ← Role-based inventory + persistence
│   │       ├── goals_loader.js        ← Goal registry + role-goal mapping
│   │       └── formation_manager.js   ← Squad formation positions
│   ├── epic_fight/
│   │   ├── epic_fight_config.json
│   │   ├── epic_fight_connector.js
│   │   └── ai_goals/
│   │       ├── melee_combat.js
│   │       ├── dodge_attacks.js
│   │       ├── protect_allies.js
│   │       ├── aggressive_assault.js
│   │       └── defensive_stance.js
│   └── irons_spells/
│       ├── irons_config.json
│       ├── irons_connector.js
│       └── ai_goals/
│           ├── cast_offensive_spells.js
│           ├── cast_support_spells.js
│           ├── manage_mana.js
│           ├── maintain_distance.js
│           └── prioritize_targets.js
│
├── API_Docs/                          ← Reference documentation
│   ├── CNPC_Scripting_API.md
│   ├── TACZ_Scripting_API.md
│   └── SYSTEM_ARCHITECTURE.md        ← This file
│
└── docs/
    └── TACZ_INSTRUCTIONS.md          ← Setup and usage guide
```

---

## Load Order (`core/loader.js`)

```
loader.js
  │
  ├─ core/gemini_brain.js             (HTTP wrapper for Gemini API)
  ├─ core/openrouter_brain.js         (HTTP wrapper for OpenRouter API)
  ├─ core/brain_factory.js            (provider instantiation)
  ├─ core/brain_registry.js           (entityId → role mapping)
  ├─ core/ai_manager.js               (master router + ModelBrainRegistry)
  │
  ├─ core/tacz_models/gemini/model_brain.js      (self-registers)
  ├─ core/tacz_models/openrouter/model_brain.js  (self-registers)
  ├─ core/ef_models/gemini/model_brain.js        (self-registers)
  ├─ core/irons_models/gemini/model_brain.js     (self-registers)
  │
  ├─ npc_talk/session_store.js
  ├─ npc_talk/talk_manager.js
  ├─ npc_talk/interaction_logic.js
  │
  ├─ modules/tacz/utils/context_builder.js
  ├─ modules/tacz/utils/loadout_manager.js
  ├─ modules/tacz/utils/goals_loader.js
  ├─ modules/tacz/utils/formation_manager.js
  └─ modules/tacz/tacz_connector.js
       │
       └─ AIManager.init(master_config.json)
          TACZConnector.init(tacz_config.json)   ← LoadoutManager.init() called here
```

**Role scripts load AFTER `loader.js` and load only their own goal files:**

```
sniper.js
  │
  ├─ loader.js                          (once — guard prevents re-loading)
  ├─ modules/tacz/ai_goals/hold_position.js
  ├─ modules/tacz/ai_goals/engage_priority_targets.js
  ├─ modules/tacz/ai_goals/report_contacts.js
  └─ modules/tacz/ai_goals/follow_leader_formation.js
       │
       └─ GoalsLoader.setRoleGoals("sniper", [...])
```

---

## Data Flow: NPC Interaction → AI Response

```
Player right-clicks / sends message
         │
         ▼
[Role Script: sniper.js]
  interact(event)
    │
    ├─ Reads NPC health, position, equipment from event.npc
    ├─ Reads player data from event.player
    ├─ Reads world data (time, weather, biome)
    ├─ LoadoutManager.toEquipmentArray(entityId, npc)
    │
    ▼
[ContextBuilder.build({npcData, playerData, worldData, nearbyData})]
  Normalises all raw data into the standard context schema
         │
         ▼
[TACZConnector.handleRoleInteraction(role, entityId, context, msg, cb)]
  Attaches:
    context.goals  = GoalsLoader.formatForPrompt(roleId)
    context.roleId = roleId
    context.formation = FormationManager.getFormation(squadLeaderId)
         │
         ▼
[AIManager.interact("tacz", entityId, provider, context, msg, cb)]
  Checks TalkManager state:
    IDLE      → ACK response → transition to LISTENING
    LISTENING → full conversation (with history) → stay LISTENING
    closing phrase → CLOSING response → transition to IDLE
         │
         ▼
[ModelBrainRegistry.get("tacz", "gemini").buildSystemPrompt(context, mode)]
  Builds system prompt from:
    • Role persona (persona title + tone)
    • Current situation (time, weather, biome, health)
    • Loadout (equipment array)
    • Active goals (from GoalsLoader)
    • Formation + command chain
    • Nearby entities
         │
         ▼
[GeminiBrain / OpenRouterBrain .think(systemPrompt, msg, callback)]
  HTTP call → AI provider
         │
         ▼
[callback(null, responseText)]
  event.npc.say(responseText)
```

---

## The `ai_goals/` Pattern

### Why
Goals were previously defined inline inside `goals_loader.js` and selected from
`tacz_config.json`. This required editing two files to add a new goal and offered
no modularity — every role loaded every goal.

The new file-per-goal pattern lets:
- **Role scripts** cherry-pick exactly the goals they need via `load()`
- **Goal files** to be shared across modules (just load from a different path)
- **New goals** to be added without touching `goals_loader.js`

### How a goal file works

```javascript
// modules/tacz/ai_goals/hold_position.js
// Self-registers with GoalsLoader when loaded.

GoalsLoader.registerGoal(
  "hold_position",
  "Stay at the current location and do not advance under any circumstances."
)
```

### How a role script uses goals

```javascript
// In sniper.js — AFTER load(LLM_BASE_PATH + "/core/loader.js"):

var _g = LLM_BASE_PATH + "/modules/tacz/ai_goals/"
load(_g + "hold_position.js")
load(_g + "engage_priority_targets.js")
load(_g + "report_contacts.js")
load(_g + "follow_leader_formation.js")

var SNIPER_ROLE = {
  roleId:    "sniper",
  moduleId:  "tacz",
  goals:     ["hold_position", "engage_priority_targets",
               "report_contacts", "follow_leader_formation"]
}

// Declare which goals are active for this role
GoalsLoader.setRoleGoals(SNIPER_ROLE.roleId, SNIPER_ROLE.goals)
```

### Priority
`GoalsLoader.formatForPrompt(roleId)` uses:
1. Goals declared by `setRoleGoals()` (file-based, highest priority)
2. Falls back to `tacz_config.json` role goals array (legacy)

---

## Loadout Manager

### Slot Mapping (INPCInventory)
| Method                       | Contents                |
|------------------------------|-------------------------|
| `setRightHand(item)`         | Primary weapon          |
| `setLeftHand(item)`          | Primary ammo (offhand)  |
| `setDropItem(0, item, 100)`  | Secondary weapon        |
| `setDropItem(1, item, 100)`  | Secondary ammo          |
| `setDropItem(2, item, 100)`  | Melee weapon            |
| `setArmor(2, item)`          | Chest armour            |

### Lifecycle
```
NPC spawns / chunk loads → init(event)
  └─ LoadoutManager.initNPC(entityId, roleId, event.npc)
       │
       ├─ Has persisted state? → restore items from _persisted[]
       ├─ NPC already has weapon in right hand? → record as existing loadout
       └─ Neither? → apply role default from tacz_config.json loadouts{}

NPC despawns / chunk unloads → removed(event)
  └─ LoadoutManager.saveStateOnRemoval(entityId, event.npc)
       └─ stores item names + counts into _persisted[]

NPC dies → died(event)
  └─ TACZConnector.onNPCDied(entityId)
       └─ LoadoutManager.clearOnDeath(entityId)
            └─ deletes _state[] and _persisted[] — fresh loadout on next spawn
```

---

## Formation Manager

### Formation Types
| Type      | Description                                      |
|-----------|--------------------------------------------------|
| `column`  | Single-file line behind the leader               |
| `line`    | Spread out horizontally behind the leader        |
| `wedge`   | V-formation with leader at the tip               |
| `defend`  | Squad circles the leader at ~5 block radius      |

### API
```javascript
FormationManager.registerMember(leaderId, memberId)
FormationManager.setNpcRef(leaderId, entityId, npc)
FormationManager.setFormation(leaderId, "wedge")
FormationManager.updateFormation(leaderId, leaderNpc)  // moves squad members
FormationManager.removeMember(entityId)
FormationManager.disbandSquad(leaderId)
FormationManager.getFormation(leaderId)    // String
FormationManager.getMembers(leaderId)      // String[]
```

### Triggering from Squad Leader Script
The squad leader's `interact()` detects formation keywords and calls:
```javascript
TACZConnector.setFormation(entityId, "wedge")
TACZConnector.updateFormation(entityId, event.npc)
```

---

## Talk State Machine

```
           right-click (empty msg)
                  │
                  ▼
         ┌──── IDLE ────┐
         │              │
         │              │  ACK response (1 line)
         │              ▼
         │         LISTENING ◄──── player messages (full conversation)
         │              │
         │  closing     │  idle timeout OR closing phrase
         │  phrase      ▼
         └───────── IDLE (history cleared)
```

States and transitions are managed by `TalkManager` via `SessionStore`.

---

## Adding a New Module

1. Create `modules/<modname>/` with `<modname>_config.json` and `<modname>_connector.js`
2. Create `modules/<modname>/ai_goals/` with individual goal files
3. Create `core/<modname>_models/<provider>/model_brain.js` — call
   `ModelBrainRegistry.register("<modname>", "<provider>", { buildSystemPrompt, brainProvider })` at the bottom
4. Create `modules/<modname>/roles/<role>.js` — load goal files, call `GoalsLoader.setRoleGoals()`
5. Add `load()` calls to `core/loader.js` and call `<ModConnector>.init(configPath)`

---

## Command Chain

All non-squad-leader TACZ NPCs recognise two masters:
1. **Player** — direct orders via right-click interaction
2. **Squad Leader** — formation and tactical orders relayed through `FormationManager`

The squad leader receives orders from the player (master) and relays them
as formation changes + AI context to squad members.

Context properties set by `TACZConnector.handleRoleInteraction()`:
```
context.roleId          — "sniper", "medic", etc.
context.goals           — formatted goal strings from GoalsLoader
context.formation       — current formation type ("column", "wedge", ...)
context.squadLeaderId   — UUID of the squad leader (if set on the role config)
```

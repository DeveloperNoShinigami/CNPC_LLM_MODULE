# TACZ LLM Module — Setup and Usage Guide

> **For:** Minecraft 1.20.1 · CustomNPCs (CNPC) · Timeless and Classics Zero (TACZ)  
> **Engine:** Rhino JavaScript (ES5, no semicolons, no imports)

---

## Quick Start

### 1. Install

Copy the entire `LLM_MODULE` folder into your world's script directory:

```
<world>/scripts/ecmascript/LLM_MODULE/
```

The exact path depends on your setup:
- **Single-player:** `<minecraft>/saves/<WorldName>/scripts/ecmascript/LLM_MODULE/`
- **Dedicated server:** `<server_root>/<WorldName>/scripts/ecmascript/LLM_MODULE/`

### 2. Configure API keys

Edit `core/master_config.json`:

```json
{
  "version": "1.0.0",
  "default_brain": "gemini",
  "brain_providers": {
    "gemini": {
      "api_key": "YOUR_GEMINI_API_KEY",
      "model": "gemini-1.5-flash"
    },
    "openrouter": {
      "api_key": "YOUR_OPENROUTER_API_KEY",
      "model": "openai/gpt-4o-mini"
    }
  },
  "talk_settings": {
    "idle_timeout_ms": 30000,
    "closing_phrases": ["goodbye", "bye", "dismiss", "at ease", "fall out"]
  }
}
```

### 3. Assign a role script to an NPC

1. Open CNPC's NPC editor (sneak + right-click the NPC)
2. Go to the **Script** tab
3. Set the script path to one of the role scripts:

| Role          | Script Path                                    |
|---------------|------------------------------------------------|
| Squad Leader  | `modules/tacz/roles/squad_leader.js`           |
| Soldier       | `modules/tacz/roles/soldier.js`                |
| Sniper        | `modules/tacz/roles/sniper.js`                 |
| Medic         | `modules/tacz/roles/medic.js`                  |
| Launcher      | `modules/tacz/roles/launcher.js`               |
| Scout         | `modules/tacz/roles/scout.js`                  |

That's it. The script auto-loads the full LLM system, applies the default loadout,
and wires up all CNPC events.

---

## Available Roles

### Squad Leader
- **Persona:** Authoritative, tactical, commanding
- **Weapons:** M4A1 · Glock 17 · Combat Knife
- **Goals:** patrol, engage hostiles, report contacts, coordinate squad, maintain formation
- **Special:** Detects formation commands in player messages and repositions the squad

### Soldier
- **Persona:** Disciplined, mission-focused
- **Weapons:** AK-47 · M1911 · Combat Knife
- **Goals:** patrol, engage hostiles, suppress hostiles, follow leader formation

### Sniper
- **Persona:** Cold, precise, economical with words
- **Weapons:** SVD Dragunov · Glock 17 · Combat Knife
- **Goals:** hold position, engage priority targets, report contacts, follow leader formation

### Medic
- **Persona:** Calm under fire, focused on casualty care
- **Weapons:** MP5 · Glock 17 · Combat Knife
- **Goals:** treat wounded, follow leader formation, engage hostiles when necessary

### Launcher
- **Persona:** Deliberate, heavy weapons specialist
- **Weapons:** RPG-7 · AK-47 · Combat Knife
- **Goals:** fire support, engage priority targets, hold position, follow leader formation

### Scout
- **Persona:** Quick, observational, reports in short bursts
- **Weapons:** MP5 · Glock 17 · Combat Knife
- **Goals:** scout area, report contacts, follow leader formation, engage hostiles

---

## Squad Formations

The **squad leader** controls the squad's tactical formation.  
Type a formation keyword when talking to the squad leader — it will automatically
reposition all registered squad members.

| Keyword in chat | Formation | Description                                 |
|-----------------|-----------|---------------------------------------------|
| `column`        | Column    | Single-file line trailing the leader        |
| `line`          | Line      | Spread horizontally behind the leader       |
| `wedge`         | Wedge     | V-formation with the leader at the tip      |
| `defend` / `circle` | Defend | Squad encircles the leader at close range  |

### Registering squad members with a leader

In each squad member's role script, set `squadLeaderId` to the UUID of the squad
leader NPC:

```javascript
// In sniper.js (near the top, after the role config):
SNIPER_ROLE.squadLeaderId = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

The NPC's UUID is shown in the CNPC editor's **Advanced** tab.

---

## Loadout Management

### Automatic loadout on first spawn

When an NPC with a role script initialises for the **first time** (no weapon in
right hand, no persisted state), the `LoadoutManager` gives it its role's default
loadout from `modules/tacz/tacz_config.json`:

```json
"loadouts": {
  "sniper": {
    "primary":        "tacz:svd",
    "primary_ammo":   "tacz:7_62x54mm",
    "secondary":      "tacz:glock17",
    "secondary_ammo": "tacz:9mm",
    "melee":          "tacz:combat_knife",
    "armour":         null,
    "ammo_stack_size": 10
  }
}
```

### Slot layout (INPCInventory)

| Slot           | Contents                                    |
|----------------|---------------------------------------------|
| Right Hand     | Primary weapon                              |
| Left Hand      | Primary ammo stack (offhand)                |
| Drop Item 0    | Secondary weapon (loot slot)                |
| Drop Item 1    | Secondary ammo stack (loot slot)            |
| Drop Item 2    | Melee weapon (loot slot)                    |
| Armor slot 2   | Chestplate (if configured)                  |

### Do not overwrite existing loadouts

If the NPC already has a weapon in its right hand (e.g., configured manually in the
CNPC editor), the script **will not change** the right-hand weapon. However, it will
not automatically add ammo or secondary/melee weapons to empty loot slots either.

**If you configure an NPC manually via the CNPC editor, also configure all loot slots**
(secondary weapon in Drop Item 0, ammo in Left Hand, melee in Drop Item 2) so the
loadout is complete. The script will detect the right-hand weapon and preserve everything.

### Loadout persistence across chunk unloads

When an NPC is removed from the world (chunk unloads, despawn), the current loadout
is **saved to memory**.  On next load, the saved state is restored automatically.

### Loadout reset on death

When the NPC **dies**, all saved state is cleared.  On the next spawn, the NPC gets
a fresh copy of its role's default loadout.

### Customising loadouts

Change `tacz_config.json` loadout entries to use your preferred TACZ items.  
The item IDs must match your installed TACZ version exactly (e.g., `tacz:ak47`).

---

## AI Goals System

Goals define what the NPC is trying to accomplish, and are embedded in the AI system
prompt so the NPC's responses reflect its current objectives.

### How goals work

Each goal is a standalone file in `modules/tacz/ai_goals/`.
Role scripts `load()` only the goals they need, then register them:

```javascript
// Example from sniper.js
load(_g + "hold_position.js")          // registers "hold_position" with GoalsLoader
load(_g + "engage_priority_targets.js")

GoalsLoader.setRoleGoals("sniper",
  ["hold_position", "engage_priority_targets", "report_contacts", "follow_leader_formation"])
```

### Available goals (tacz module)

| Goal file                    | Goal key                    | Behaviour                                       |
|------------------------------|-----------------------------|-------------------------------------------------|
| `patrol.js`                  | `patrol`                    | Move patrol route, stay alert                   |
| `engage_hostiles.js`         | `engage_hostiles`           | Attack detected hostiles                        |
| `hold_position.js`           | `hold_position`             | Stay at location, do not advance                |
| `engage_priority_targets.js` | `engage_priority_targets`   | Eliminate highest-threat target first           |
| `report_contacts.js`         | `report_contacts`           | Verbally report new contacts                    |
| `suppress_hostiles.js`       | `suppress_hostiles`         | Lay down suppressive fire                       |
| `resupply_allies.js`         | `resupply_allies`           | Distribute ammo to nearby allies                |
| `secure_area.js`             | `secure_area`               | Clear and hold the immediate area               |
| `coordinate_squad.js`        | `coordinate_squad`          | Issue tactical orders to squad                  |
| `follow_player_on_order.js`  | `follow_player_on_order`    | Follow player when ordered                      |
| `treat_wounded.js`           | `treat_wounded`             | Treat injured allies                            |
| `fire_support.js`            | `fire_support`              | Provide explosive fire support                  |
| `scout_area.js`              | `scout_area`                | Move ahead to gather intel                      |
| `follow_leader_formation.js` | `follow_leader_formation`   | Maintain formation position                     |
| `maintain_formation.js`      | `maintain_formation`        | Keep squad in current formation                 |
| `relay_orders.js`            | `relay_orders`              | Relay orders to other squad members             |

### Adding a custom goal

Create a new file in `modules/tacz/ai_goals/`:

```javascript
// modules/tacz/ai_goals/my_custom_goal.js
GoalsLoader.registerGoal(
  "my_custom_goal",
  "Description of what the NPC will try to do."
)
```

Then `load()` it in your role script before calling `GoalsLoader.setRoleGoals()`.

---

## AI Provider Switch

To switch a role's AI provider, edit the `brainProvider` field in the role script:

```javascript
var SNIPER_ROLE = {
  roleId:        "sniper",
  brainProvider: "openrouter",   // ← change here
  ...
}
```

Or use `"gemini"` for Google Gemini (default).

---

## Command Chain

All squad NPCs (non-leaders) obey two chains of command:

1. **Player (master)** — direct orders via chat/interact always take priority
2. **Squad Leader** — formation and tactical commands, relayed automatically

The squad leader receives orders from the player and translates them into:
- Formation changes (typed keywords in chat)
- AI context updates (formation name is embedded in every system prompt)

---

## Conversation States

Each NPC has a two-state conversation machine:

| State       | Trigger                                | NPC Behaviour                                     |
|-------------|----------------------------------------|---------------------------------------------------|
| `IDLE`      | Default                                | One-line acknowledgment on right-click            |
| `LISTENING` | Right-click (moves from IDLE)          | Full multi-turn conversation                      |
| Back to `IDLE` | Closing phrase (bye, dismiss, etc.) or 30s idle | Conversation history cleared         |

---

## Troubleshooting

### NPC says "(static) Copy that — stand by."
The AI API call failed.  Check:
- `core/master_config.json` has a valid API key
- The provider model name is correct
- The server has internet access (for API calls)

### NPC spawns without weapons
- Verify TACZ item IDs in `tacz_config.json` match your installed version
- Check the server console for `LoadoutManager:` log lines
- CNPC may need op-command permissions if item creation requires it

### Formation not working
- Set `squadLeaderId` in the squad member's role script to the leader's UUID
- The squad leader must be initialised (`init()` called) before members
- Check the console for `FormationManager:` log lines

### Goals not appearing in AI responses
- Ensure the goal files are `load()`-ed before `GoalsLoader.setRoleGoals()` is called
- Check `GoalsLoader.listGoals()` in a test script to confirm registration
- The AI may not reference goals explicitly but will use them to shape responses

---

## File Reference

```
core/
  loader.js               — Master entry point; chain-loads every dependency
  master_config.json      — API keys, provider config, talk settings
  ai_manager.js           — Routes events to model brains
  brain_registry.js       — entityId → role mapping

modules/tacz/
  tacz_config.json        — Role definitions + default weapon loadouts
  tacz_connector.js       — CNPC events → AIManager bridge
  ai_goals/               — Individual goal files (load what you need)
  roles/                  — One script per NPC role
  utils/
    context_builder.js    — Normalise CNPC data into AI context
    loadout_manager.js    — Role-based inventory + persistence
    goals_loader.js       — Goal registry + role-goal mapping
    formation_manager.js  — Squad formation positions

API_Docs/
  CNPC_Scripting_API.md   — Full CNPC 1.20.1 API reference
  TACZ_Scripting_API.md   — TACZ API reference + integration patterns
  SYSTEM_ARCHITECTURE.md  — How the system is designed
```

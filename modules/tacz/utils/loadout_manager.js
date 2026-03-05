// modules/tacz/utils/loadout_manager.js — NPC Loadout Manager (role-based)
//
// CNPC ES5 Scripting Standard — Rhino JavaScript Engine
//
// Manages TACZ weapons, ammo, and armour for NPCs using the CNPC INPCInventory API.
//
// ── INVENTORY SLOT MAPPING (INPCInventory) ───────────────────────────────────
//   setRightHand(item)        — Primary weapon (what the NPC actively uses)
//   setLeftHand(item)         — Primary ammo stack (offhand)
//   setDropItem(0, item, 100) — Secondary weapon  (loot slot 0)
//   setDropItem(1, item, 100) — Secondary ammo     (loot slot 1)
//   setDropItem(2, item, 100) — Melee weapon        (loot slot 2)
//   setArmor(2, item)         — Chestplate          (slot 2)
//
// ── LIFECYCLE ────────────────────────────────────────────────────────────────
//   init(event) in role script:
//     → LoadoutManager.initNPC(entityId, roleId, event.npc)
//        1. Persisted state exists? → restore items
//        2. NPC already has a weapon in right-hand? → record as existing
//        3. Neither → apply role default loadout from tacz_config.json
//
//   removed(event) in role script:
//     → LoadoutManager.saveStateOnRemoval(entityId, event.npc)
//        Saves current inventory into _persisted so it survives chunk unloads.
//
//   died(event) in role script:
//     → LoadoutManager.clearOnDeath(entityId)
//        Wipes _state and _persisted so the NPC gets a fresh loadout on respawn.
//
// ── CONFIG ────────────────────────────────────────────────────────────────────
//   LoadoutManager.init(configObj) is called by TACZConnector.init().
//   Role default loadouts come from tacz_config.json's "loadouts" object.

var LoadoutManager = (function() {

  // ── Per-entity runtime state ───────────────────────────────────────────────

  // entityId → { role, loadoutApplied }
  var _state = {}

  // entityId → snapshot of item names/counts from last saveStateOnRemoval()
  // Survives chunk unloads within a server session; cleared on death.
  var _persisted = {}

  // Config loaded from tacz_config.json (contains role loadout definitions)
  var _config = null

  // ── Item creation helper ──────────────────────────────────────────────────

  function _createItem(world, itemId, count) {
    if (!itemId || !world) { return null }
    try {
      return world.createItem(String(itemId), count || 1)
    } catch (e) {
      LLM_LOG("LoadoutManager: could not create item '" + itemId + "': " + e.toString())
      return null
    }
  }

  // ── Read current NPC inventory into a snapshot object ─────────────────────

  function _snapshotInventory(npc) {
    var snap = { rightHand: null, leftHand: null, dropItems: [], armor: [] }
    try {
      var inv = npc.getInventory()
      var rh  = inv.getRightHand()
      if (rh  && !rh.isEmpty())  { snap.rightHand = {name: String(rh.getName()), count: 1} }
      var lh  = inv.getLeftHand()
      if (lh  && !lh.isEmpty())  { snap.leftHand  = {name: String(lh.getName()), count: lh.getStackSize()} }
      // Read loot/drop slots 0-5
      for (var i = 0; i < 6; i++) {
        var di = inv.getDropItem(i)
        if (di && !di.isEmpty()) {
          snap.dropItems.push({slot: i, name: String(di.getName()), count: di.getStackSize()})
        }
      }
      // Read armor slots 0-3
      for (var j = 0; j < 4; j++) {
        var arm = inv.getArmor(j)
        if (arm && !arm.isEmpty()) {
          snap.armor.push({slot: j, name: String(arm.getName())})
        }
      }
    } catch (e) { LLM_LOG("LoadoutManager: snapshot error: " + e) }
    return snap
  }

  // ── Restore a snapshot into NPC inventory ─────────────────────────────────

  function _applySnapshot(npc, snap) {
    if (!snap) { return }
    try {
      var inv   = npc.getInventory()
      var world = npc.getWorld()
      if (snap.rightHand) {
        var rh = _createItem(world, snap.rightHand.name, 1)
        if (rh) { inv.setRightHand(rh) }
      }
      if (snap.leftHand) {
        var lh = _createItem(world, snap.leftHand.name, snap.leftHand.count)
        if (lh) { inv.setLeftHand(lh) }
      }
      for (var i = 0; i < snap.dropItems.length; i++) {
        var di = snap.dropItems[i]
        var item = _createItem(world, di.name, di.count)
        if (item) { inv.setDropItem(di.slot, item, 100) }
      }
      for (var j = 0; j < snap.armor.length; j++) {
        var ar = snap.armor[j]
        var piece = _createItem(world, ar.name, 1)
        if (piece) { inv.setArmor(ar.slot, piece) }
      }
    } catch (e) { LLM_LOG("LoadoutManager: applySnapshot error: " + e) }
  }

  // ── Check if NPC has a weapon equipped ────────────────────────────────────

  function _hasWeapon(npc) {
    try {
      var rh = npc.getInventory().getRightHand()
      return rh != null && !rh.isEmpty()
    } catch (e) {
      // Fallback: try entity-level mainhand check
      try {
        var mh = npc.getMainhandItem ? npc.getMainhandItem() : null
        return mh != null && !mh.isEmpty()
      } catch (e2) { return false }
    }
  }

  // ── Apply role default loadout from config ─────────────────────────────────

  function _applyDefaultLoadout(entityId, role, npc) {
    var defaults = (_config && _config.loadouts) ? _config.loadouts[role] : null
    if (!defaults) {
      LLM_LOG("LoadoutManager: no default loadout configured for role '" + role + "'.")
      return
    }
    var world = npc.getWorld()
    var inv   = npc.getInventory()
    try {
      // Primary weapon → right hand
      if (defaults.primary) {
        var primary = _createItem(world, defaults.primary, 1)
        if (primary) { inv.setRightHand(primary) }
      }
      // Primary ammo → left hand (offhand)
      if (defaults.primary_ammo) {
        var ammoCount   = defaults.ammo_stack_size || 30
        var primaryAmmo = _createItem(world, defaults.primary_ammo, ammoCount)
        if (primaryAmmo) { inv.setLeftHand(primaryAmmo) }
      }
      // Secondary weapon → loot slot 0
      if (defaults.secondary) {
        var secondary = _createItem(world, defaults.secondary, 1)
        if (secondary) { inv.setDropItem(0, secondary, 100) }
      }
      // Secondary ammo → loot slot 1 (only if different from primary ammo)
      if (defaults.secondary_ammo && defaults.secondary_ammo !== defaults.primary_ammo) {
        var secAmmo = _createItem(world, defaults.secondary_ammo, defaults.ammo_stack_size || 30)
        if (secAmmo) { inv.setDropItem(1, secAmmo, 100) }
      }
      // Melee weapon → loot slot 2
      if (defaults.melee) {
        var melee = _createItem(world, defaults.melee, 1)
        if (melee) { inv.setDropItem(2, melee, 100) }
      }
      // Armour → chest slot (slot 2 = chestplate)
      if (defaults.armour) {
        var armour = _createItem(world, defaults.armour, 1)
        if (armour) { inv.setArmor(2, armour) }
      }
      _state[entityId].loadoutApplied = true
      LLM_LOG("LoadoutManager: applied default '" + role + "' loadout to " + entityId)
    } catch (e) {
      LLM_LOG("LoadoutManager: error applying loadout for " + entityId + ": " + e)
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  return {

    // Initialise the manager with the parsed tacz_config object.
    // Called automatically by TACZConnector.init().
    init: function(configObj) {
      _config = configObj
    },

    // Smart NPC initialisation — decides whether to restore, preserve, or apply.
    // Call this from every role script's init(event) handler.
    initNPC: function(entityId, role, npc) {
      if (!_state[entityId]) {
        _state[entityId] = { role: role, loadoutApplied: false }
      }
      // Priority 1: Restore persisted state (survives chunk unloads within session)
      if (_persisted[entityId]) {
        _applySnapshot(npc, _persisted[entityId])
        _state[entityId].loadoutApplied = true
        LLM_LOG("LoadoutManager: restored persisted loadout for " + entityId)
        return
      }
      // Priority 2: NPC already has a weapon (manually configured via CNPC editor)
      if (_hasWeapon(npc)) {
        _state[entityId].loadoutApplied = true
        LLM_LOG("LoadoutManager: existing weapon detected for " + entityId + " — preserving.")
        return
      }
      // Priority 3: First-time spawn — apply role default from config
      _applyDefaultLoadout(entityId, role, npc)
    },

    // Save current NPC inventory to persisted state before removal.
    // Call from removed(event) so the loadout survives chunk unloads.
    saveStateOnRemoval: function(entityId, npc) {
      try {
        _persisted[entityId] = _snapshotInventory(npc)
        LLM_LOG("LoadoutManager: saved state for " + entityId)
      } catch (e) {
        LLM_LOG("LoadoutManager: saveStateOnRemoval error for " + entityId + ": " + e)
      }
    },

    // Clear all state on NPC death.  The NPC gets a fresh loadout on next spawn.
    // Clears BOTH _state (role/loadoutApplied flag) AND _persisted (saved inventory
    // snapshot) so the NPC starts completely fresh after respawning.
    // Contrast with saveStateOnRemoval() which preserves _persisted for chunk unloads.
    clearOnDeath: function(entityId) {
      delete _state[entityId]
      delete _persisted[entityId]
      LLM_LOG("LoadoutManager: cleared state on death for " + entityId)
    },

    // Refill ammo in the offhand from the current gun's ammo type.
    // Call periodically or when the NPC runs low.
    refillAmmo: function(entityId, npc) {
      var defaults = (_config && _config.loadouts && _state[entityId])
        ? _config.loadouts[_state[entityId].role]
        : null
      if (!defaults || !defaults.primary_ammo) { return }
      try {
        var inv   = npc.getInventory()
        var world = npc.getWorld()
        var ammoCount = defaults.ammo_stack_size || 30
        var ammo      = _createItem(world, defaults.primary_ammo, ammoCount)
        if (ammo) { inv.setLeftHand(ammo) }
      } catch (e) { LLM_LOG("LoadoutManager: refillAmmo error: " + e) }
    },

    // ── Legacy / compatibility API (kept for existing connectors) ──────────

    // Set the full stored loadout record for an NPC (used by legacy code paths).
    set: function(entityId, loadout) {
      if (!_state[entityId]) {
        _state[entityId] = { role: "soldier", loadoutApplied: false }
      }
      _state[entityId].loadout = loadout
    },

    // Get the stored loadout record for an NPC.
    get: function(entityId) {
      return (_state[entityId] && _state[entityId].loadout) || _defaultLoadout()
    },

    // Patch individual fields.
    update: function(entityId, patch) {
      var existing = LoadoutManager.get(entityId)
      for (var k in patch) { existing[k] = patch[k] }
      if (_state[entityId]) { _state[entityId].loadout = existing }
    },

    // Remove all state for an NPC (permanent cleanup on final despawn).
    remove: function(entityId) {
      delete _state[entityId]
      delete _persisted[entityId]
    },

    // Format stored loadout as a human-readable string for AI context.
    formatForContext: function(entityId) {
      var l = LoadoutManager.get(entityId)
      var parts = []
      if (l.primary)   { parts.push("Primary: "   + l.primary) }
      if (l.secondary) { parts.push("Secondary: " + l.secondary) }
      if (l.melee)     { parts.push("Melee: "     + l.melee) }
      if (l.armour)    { parts.push("Armour: "    + l.armour) }
      if (l.attachments && l.attachments.length > 0) {
        parts.push("Attachments: " + l.attachments.join(", "))
      }
      var ammoKeys = Object.keys(l.ammo || {})
      if (ammoKeys.length > 0) {
        var ammoStr = []
        for (var i = 0; i < ammoKeys.length; i++) {
          ammoStr.push(ammoKeys[i] + ": " + l.ammo[ammoKeys[i]])
        }
        parts.push("Ammo: " + ammoStr.join(", "))
      }
      return parts.length > 0 ? parts.join(" | ") : "No loadout assigned"
    },

    // Return the NPC's current equipment as a string array for AI context.
    // Reads from the live INPCInventory when npc is provided; falls back to stored.
    toEquipmentArray: function(entityId, npc) {
      if (npc) {
        try {
          var inv   = npc.getInventory()
          var items = []
          var rh    = inv.getRightHand()
          if (rh    && !rh.isEmpty())  { items.push(String(rh.getDisplayName())) }
          var lh    = inv.getLeftHand()
          if (lh    && !lh.isEmpty())  { items.push(String(lh.getDisplayName())) }
          for (var i = 0; i < 3; i++) {
            var di = inv.getDropItem(i)
            if (di && !di.isEmpty()) { items.push(String(di.getDisplayName())) }
          }
          if (items.length > 0) { return items }
        } catch (e) { /* fall through to stored loadout */ }
      }
      var l = LoadoutManager.get(entityId)
      var stored = []
      if (l.primary)   { stored.push(l.primary) }
      if (l.secondary) { stored.push(l.secondary) }
      if (l.melee)     { stored.push(l.melee) }
      if (l.armour)    { stored.push(l.armour) }
      return stored
    }

  }

  // ── Default empty loadout (for legacy get()) ────────────────────────────
  function _defaultLoadout() {
    return { primary: null, secondary: null, melee: null, armour: null, attachments: [], ammo: {} }
  }

})()



// modules/tacz/utils/loadout_manager.js — NPC Loadout Manager for TACZ NPCs.
//
// CNPC ES5 Scripting Standard — Rhino JavaScript Engine
//
// Manages the weapons, equipment, and ammunition that a TACZ NPC carries.
// Provides helpers for:
//   - Building a loadout string for AI context inclusion.
//   - Updating an NPC's loadout at runtime.
//   - Querying loadout details (primary weapon, secondary, attachments).
//
// In a full CNPC + TACZ integration, the apply() method would call the
// appropriate CNPC/TACZ scripting API to actually equip the NPC.

var LoadoutManager = (function() {

  var _loadouts = {}

  function _defaultLoadout() {
    return {
      primary:     null,
      secondary:   null,
      melee:       null,
      armour:      null,
      attachments: [],
      ammo:        {}
    }
  }

  return {

    // Set the full loadout for an NPC.
    // loadout fields: primary, secondary, melee, armour, attachments[], ammo{}
    set: function(entityId, loadout) {
      var defaults = _defaultLoadout()
      var merged = {}
      for (var k in defaults) merged[k] = defaults[k]
      for (var k in loadout)  merged[k] = loadout[k]
      _loadouts[entityId] = merged
    },

    // Get the loadout for an NPC.
    // Returns a default empty loadout if none has been assigned.
    get: function(entityId) {
      return _loadouts[entityId] || _defaultLoadout()
    },

    // Update individual fields of an NPC's loadout without replacing the whole object.
    update: function(entityId, patch) {
      var existing = LoadoutManager.get(entityId)
      for (var k in patch) existing[k] = patch[k]
      _loadouts[entityId] = existing
    },

    // Remove the loadout entry for an NPC.
    remove: function(entityId) {
      delete _loadouts[entityId]
    },

    // Format the loadout as a human-readable string for AI context embedding.
    formatForContext: function(entityId) {
      var l = LoadoutManager.get(entityId)
      var parts = []
      if (l.primary)   parts.push("Primary: " + l.primary)
      if (l.secondary) parts.push("Secondary: " + l.secondary)
      if (l.melee)     parts.push("Melee: " + l.melee)
      if (l.armour)    parts.push("Armour: " + l.armour)
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

    // Return the loadout as a simple equipment string array.
    // Compatible with the context.npc.equipment field expected by model_brain.js.
    toEquipmentArray: function(entityId) {
      var l = LoadoutManager.get(entityId)
      var items = []
      if (l.primary)   items.push(l.primary)
      if (l.secondary) items.push(l.secondary)
      if (l.melee)     items.push(l.melee)
      if (l.armour)    items.push(l.armour)
      return items
    }

  }

})()


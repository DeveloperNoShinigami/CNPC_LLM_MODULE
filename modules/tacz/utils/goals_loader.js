// modules/tacz/utils/goals_loader.js — AI Task / Goal Set Loader for TACZ NPCs.
//
// CNPC ES5 Scripting Standard — Rhino JavaScript Engine
//
// Loads goal definitions from the TACZ config and provides helpers for
// resolving which goal set applies to a given NPC role.
//
// In a full CNPC implementation these goals would be passed to the CNPC AI
// goal queue.  Here they serve as context enrichment strings that the brain
// can reference when deciding NPC behaviour.
//
// Goals are defined in modules/tacz/tacz_config.json under each role:
//   "rifleman": { "goals": ["patrol", "engage_hostiles", ...] }
//
// Depends on: tacz_config (loaded as TACZConfig global, or provide configObj to init())

var GoalsLoader = (function() {

  // Built-in goal descriptors.
  var _goalDescriptors = {
    "patrol":                  "Move along a predefined patrol route, staying alert for hostiles.",
    "engage_hostiles":         "Attack any detected hostile entity within range.",
    "follow_player_on_order":  "Follow the player when ordered to do so.",
    "hold_position":           "Stay at the current location and do not advance.",
    "engage_priority_targets": "Identify and eliminate the highest-threat target first.",
    "report_contacts":         "Verbally report when new entities are detected nearby.",
    "suppress_hostiles":       "Lay down suppressive fire to pin down enemies.",
    "resupply_allies":         "Distribute ammunition and supplies to nearby friendly NPCs.",
    "secure_area":             "Clear and hold the immediate area of all hostile entities.",
    "coordinate_squad":        "Issue tactical orders to nearby friendly NPCs and keep the unit cohesive."
  }

  var _config = null

  return {

    // Provide the parsed tacz_config object.
    // Call this once after loading tacz_config.json.
    init: function(configObj) {
      _config = configObj
    },

    // Get the list of goal names for a given NPC role.
    getGoalNames: function(role) {
      if (!_config || !_config.roles || !_config.roles[role]) return []
      return _config.roles[role].goals || []
    },

    // Get full goal descriptors for a given NPC role.
    // Returns an array of human-readable strings for inclusion in a system prompt.
    getGoalDescriptors: function(role) {
      var names = GoalsLoader.getGoalNames(role)
      var results = []
      for (var i = 0; i < names.length; i++) {
        var desc = _goalDescriptors[names[i]]
        results.push(desc ? "[" + names[i] + "] " + desc : "[" + names[i] + "] (no descriptor available)")
      }
      return results
    },

    // Format goals as a single multi-line string for embedding in a system prompt.
    formatForPrompt: function(role) {
      var descriptors = GoalsLoader.getGoalDescriptors(role)
      if (descriptors.length === 0) return "No specific goals assigned."
      return descriptors.join("\n")
    },

    // Register a custom goal descriptor.
    // Use this to extend the built-in goal set without modifying this file.
    registerGoal: function(name, descriptor) {
      _goalDescriptors[name] = descriptor
    },

    // List all registered goal names.
    listGoals: function() {
      return Object.keys(_goalDescriptors)
    }

  }

})()


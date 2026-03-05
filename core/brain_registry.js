// core/brain_registry.js — Internal registry mapping entity/NPC IDs to brain roles.
//
// CNPC ES5 Scripting Standard — Rhino JavaScript Engine
//
// BrainRegistry acts as an in-memory lookup table so the AI Manager can
// quickly resolve which brain instance and role is bound to a given NPC entity.
//
// Registry entry structure:
//   {
//     entityId  : string  — Unique NPC entity identifier
//     moduleId  : string  — Which module owns this NPC (e.g. "tacz", "epic_fight")
//     brainRole : string  — Role string from the module config (e.g. "rifleman", "mage")
//     brainRef  : object  — Live brain instance (set after first interaction)
//   }

var BrainRegistry = (function() {

  var _registry = {}

  return {

    // Register an NPC entity with its module and role.
    register: function(entityId, moduleId, brainRole) {
      _registry[entityId] = {
        entityId:  entityId,
        moduleId:  moduleId,
        brainRole: brainRole,
        brainRef:  null
      }
    },

    // Attach a live brain instance to an already-registered entity.
    attachBrain: function(entityId, brainRef) {
      if (!_registry[entityId]) {
        throw new Error("BrainRegistry: entity '" + entityId + "' is not registered.")
      }
      _registry[entityId].brainRef = brainRef
    },

    // Retrieve the full registry entry for an entity.
    get: function(entityId) {
      return _registry[entityId] || null
    },

    // Check whether an entity is already registered.
    has: function(entityId) {
      return !!_registry[entityId]
    },

    // Remove an entity from the registry (on NPC death / chunk unload).
    unregister: function(entityId) {
      delete _registry[entityId]
    },

    // Return all registered entries for a given module.
    getByModule: function(moduleId) {
      var results = []
      for (var id in _registry) {
        if (_registry[id].moduleId === moduleId) {
          results.push(_registry[id])
        }
      }
      return results
    },

    // Return a snapshot of all registry entries (useful for debugging).
    dump: function() {
      var results = []
      for (var id in _registry) {
        results.push(_registry[id])
      }
      return results
    },

    // Clear the entire registry.
    clear: function() {
      _registry = {}
    }

  }

})()


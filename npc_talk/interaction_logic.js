// npc_talk/interaction_logic.js — Parsing logic for player speech and orders.
//
// CNPC ES5 Scripting Standard — Rhino JavaScript Engine
//
// Responsibilities:
//   - Detect whether a player message is an ORDER vs general conversation.
//   - Extract the target NPC name and command from an order phrase.
//   - Detect closing / dismissal phrases.
//   - Normalise raw player input before forwarding to the AI.
//
// ORDER SYNTAX
//   "[NPCName], <natural language command>"
//   e.g. "Alpha, fall back to the checkpoint."
//        "Vadim, cover the east corridor."
//
// CLOSING SYNTAX
//   Any message containing a phrase from master_config > talk_settings > closing_phrases
//   e.g. "that is all, Alpha", "dismissed", "at ease"

var InteractionLogic = (function() {

  // ── Order detection ──────────────────────────────────────────────────────────

  function _escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  }

  return {

    // Determine whether a player message is an order addressed to a specific NPC.
    // Orders follow the pattern: "<name>, <command>" or "<name>: <command>".
    isOrder: function(message, npcName) {
      if (!message || !npcName) return false
      var pattern = new RegExp("^\\s*" + _escapeRegex(npcName) + "\\s*[,:]\\s*", "i")
      return pattern.test(message)
    },

    // Extract the command part from an order message.
    // Returns the full message unchanged if it is not an order.
    extractCommand: function(message, npcName) {
      if (!InteractionLogic.isOrder(message, npcName)) return message
      var pattern = new RegExp("^\\s*" + _escapeRegex(npcName) + "\\s*[,:]\\s*", "i")
      return message.replace(pattern, "").trim()
    },

    // Detect whether a player message contains a conversation-closing phrase.
    // closingPhrases: array of phrase strings from master_config
    isClosingPhrase: function(message, closingPhrases) {
      if (!message || typeof message !== "string") return false
      if (!closingPhrases) return false
      var lower = message.toLowerCase().trim()
      for (var i = 0; i < closingPhrases.length; i++) {
        if (lower.indexOf(closingPhrases[i].toLowerCase()) !== -1) return true
      }
      return false
    },

    // Sanitise and normalise raw player input before sending to the AI.
    // Trims whitespace, collapses multiple spaces, truncates to maxLength chars.
    normalise: function(message, maxLength) {
      if (!message || typeof message !== "string") return ""
      var limit = maxLength || 500
      return message.trim().replace(/\s+/g, " ").slice(0, limit)
    },

    // Parse a raw player message and return a structured intent object.
    // Returns: { type: "ORDER"|"CLOSING"|"CONVERSATION", text: string, rawMessage: string }
    parse: function(message, npcName, closingPhrases) {
      var clean = InteractionLogic.normalise(message)

      if (InteractionLogic.isClosingPhrase(clean, closingPhrases)) {
        return {"type": "CLOSING", "text": clean, "rawMessage": message}
      }

      if (InteractionLogic.isOrder(clean, npcName)) {
        return {"type": "ORDER", "text": InteractionLogic.extractCommand(clean, npcName), "rawMessage": message}
      }

      return {"type": "CONVERSATION", "text": clean, "rawMessage": message}
    }

  }

})()


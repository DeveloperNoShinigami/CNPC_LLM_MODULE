// modules/irons_spells/ai_goals/manage_mana.js — AI Goal: manage_mana
//
// Self-registers with GoalsLoader when loaded via load().

GoalsLoader.registerGoal(
  "manage_mana",
  "Monitor mana pool and pace spell casting to avoid running dry. Rest or use mana potions when below 30% mana."
)

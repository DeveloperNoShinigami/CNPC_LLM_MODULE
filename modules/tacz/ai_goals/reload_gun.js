// modules/tacz/ai_goals/reload_gun.js — AI Goal: reload_gun
//
// Self-registers with GoalsLoader when loaded via load().

GoalsLoader.registerGoal(
  "reload_gun",
  "Before engaging or advancing, verify the primary weapon has ammo. If the gun's current ammo count is below 5 rounds or the offhand ammo stack is empty, pause, reload, and wait for reload completion (ReloadState returns to IDLE) before re-engaging. Do not expose yourself while reloading."
)

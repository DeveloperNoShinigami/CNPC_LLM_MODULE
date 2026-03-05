# TACZ Scripting API Reference (1.20.1)

> **Mod:** Timeless and Classics Zero (TACZ)  
> **Integration:** Access through the global `TimelessAPI` object inside CNPC scripts  
> **Runtime:** Rhino JavaScript Engine (ES5, no semicolons, no imports)

---

## Overview

TACZ gun data is attached to `IItemStack` objects. Use `TimelessAPI` to unwrap them.
CNPC cannot bind to TACZ Forge events directly — instead, poll gun state in CNPC's
`tick` handler or detect damage source type strings in `damaged`/`killed` handlers.

---

## TimelessAPI — Entry Point

```javascript
// Get a gun from an item stack
var item = event.npc.getInventory().getRightHand()
var gun  = TimelessAPI.getOptionalGun(item)    // IGun | null — always null-check
if (gun == null) { return }

// Get ammo info from a stack
var ammoItem = event.npc.getInventory().getLeftHand()
var ammo = TimelessAPI.getOptionalAmmo(ammoItem)  // IAmmo | null

// Get attachment info
var attachment = TimelessAPI.getOptionalAttachment(someItem)  // IAttachment | null
```

---

## IGun — Gun Interface

### Identity
```javascript
gun.getGunId()                     // String  — registry ID, e.g. "tacz:ak47"
gun.getGunDisplayId()              // String  — skin/display ID
```

### Fire Mode
```javascript
gun.getFireMode()                  // Number: 0=AUTO, 1=SEMI, 2=BURST
gun.setFireMode(mode)              // void
```

### Ammo
```javascript
gun.getCurrentAmmoCount()          // Number
gun.setCurrentAmmoCount(n)         // void
gun.reduceCurrentAmmoCount(n)      // void
gun.hasBulletInBarrel()            // boolean
gun.setBulletInBarrel(bo)          // void
gun.useInventoryAmmo()             // boolean
gun.hasInventoryAmmo()             // boolean
```

### Dummy Ammo (NPC / Script-managed Ammo)
```javascript
gun.useDummyAmmo()                 // boolean  — true for most NPC guns
gun.getDummyAmmoAmount()           // Number
gun.setDummyAmmoAmount(n)          // void
gun.addDummyAmmoAmount(n)          // void  (negative to subtract)
gun.hasMaxDummyAmmo()              // boolean
gun.getMaxDummyAmmoAmount()        // Number
gun.setMaxDummyAmmoAmount(n)       // void
```

### Reload State
```javascript
gun.getReloadState()               // Number: 0=IDLE, 1=START, 2=IN_PROGRESS, 3=END
```

### Firing / Aiming State
```javascript
gun.isFiring()                     // boolean
gun.isAiming()                     // boolean
gun.getAimingZoom()                // Number
gun.getRPM()                       // Number  (rounds per minute)
```

### Overheat
```javascript
gun.hasHeatData()                  // boolean
gun.isOverheatLocked()             // boolean
gun.setOverheatLocked(bo)          // void
gun.getHeatAmount()                // Number
gun.setHeatAmount(n)               // void
```

### Laser
```javascript
gun.hasCustomLaserColor()          // boolean
gun.getLaserColor()                // Number  (packed ARGB)
gun.setLaserColor(color)           // void
```

### Attachments
```javascript
// Attachment slot constants (use numeric literals at runtime):
// 0=SCOPE  1=MUZZLE  2=STOCK  3=GRIP  4=MAGAZINE  5=LASER

gun.getAttachment(slot)            // IAttachment | null
gun.getBuiltinAttachment(slot)     // IAttachment | null
gun.getAttachmentId(slot)          // String  ("" if empty)
gun.allowAttachment(slot, item)    // boolean
gun.allowAttachmentType(slot)      // boolean
gun.installAttachment(slot, item)  // IItemStack | null  (returns old attachment)
gun.unloadAttachment(slot)         // IItemStack | null
gun.hasAttachmentLock()            // boolean
gun.setAttachmentLock(bo)          // void
```

### Property Modification
```javascript
// Cache-modifiable (also affected by attachments):
gun.modifyProperty("damage",           25.0)
gun.modifyProperty("ammo_speed",       1.5)
gun.modifyProperty("armor_ignore",     0.5)   // 0.0 – 1.0
gun.modifyProperty("effective_range",  64.0)
gun.modifyProperty("head_shot",        2.0)
gun.modifyProperty("knockback",        1.0)
gun.modifyProperty("pierce",           2)
gun.modifyProperty("weight_modifier",  0.8)

// Runtime-only (script only):
gun.modifyProperty("max_heat",                   100.0)
gun.modifyProperty("bullet_amount",              3)      // shotgun spread
gun.modifyProperty("burst_count",                3)
gun.modifyProperty("burst_shoot_interval",       100)    // ms between burst shots
gun.modifyProperty("bullet_life",                5.0)    // seconds
gun.modifyProperty("bullet_gravity",             0.05)
gun.modifyProperty("bullet_friction",            0.01)
gun.modifyProperty("sound_distance",             64)     // blocks
gun.modifyProperty("ignite_entity",              true)
gun.modifyProperty("ignite_entity_time",         60)     // ticks
gun.modifyProperty("ignite_block",               false)
gun.modifyProperty("explode_enabled",            true)
gun.modifyProperty("explosion_damage",           15.0)
gun.modifyProperty("explosion_radius",           3.0)
gun.modifyProperty("explosion_knockback",        true)
gun.modifyProperty("explosion_destroys_block",   false)
gun.modifyProperty("explosion_delay",            1.0)    // seconds (fuse)
```

### Drop Ammo
```javascript
gun.dropAllAmmo(world, x, y, z)    // drops loaded ammo into world
```

---

## IAmmo — Ammo Interface

```javascript
ammo.getAmmoId()                   // String  — e.g. "tacz:9mm"
ammo.getAmmoCount()                // Number  — stack size
```

---

## IAttachment — Attachment Interface

```javascript
attachment.getAttachmentId()       // String  — e.g. "tacz:acog_scope"
attachment.getAttachmentType()     // Number  — slot type (0-5)
```

---

## CNPC Event → TACZ Detection Mapping

| TACZ Event               | CNPC Handler        | Detection Method                             |
|--------------------------|---------------------|----------------------------------------------|
| GunShootEvent            | `tick`              | `gun.isFiring()` on held item                |
| GunFireEvent             | `tick`              | Same as GunShootEvent                        |
| GunReloadEvent           | `tick`              | `gun.getReloadState() != 0`                  |
| GunMeleeEvent            | `damaged`           | `event.damageSource.getType() == "tacz_melee"` |
| EntityHurtByGun          | `damaged`           | `event.damageSource.getType() == "tacz_gun"` |

---

## Code Patterns

### Detect when NPC is shot by a gun
```javascript
function damaged(event) {
  var source = event.damageSource
  if (source == null) { return }
  if (source.getType() == "tacz_gun") {
    var shooter = source.getTrueSource()
    if (shooter) {
      event.npc.say("Shot by " + shooter.getName() + "!")
    }
  }
  if (source.getType() == "tacz_melee") {
    event.npc.say("Gun-butted!")
  }
}
```

### Get gun info from the shooter
```javascript
function damaged(event) {
  var source = event.damageSource
  if (source == null || source.getType() != "tacz_gun") { return }
  var shooter = source.getTrueSource()
  if (shooter == null) { return }
  var item = shooter.getMainhandItem()
  var gun  = TimelessAPI.getOptionalGun(item)
  if (gun == null) { return }
  event.npc.say("Hit by " + gun.getGunId() + " — ammo left: " + gun.getCurrentAmmoCount())
}
```

### Refill ammo on player interact
```javascript
function interact(event) {
  var item = event.player.getInventoryHeldItem()
  var gun  = TimelessAPI.getOptionalGun(item)
  if (gun == null) { event.player.message("No gun held."); return }
  gun.setCurrentAmmoCount(gun.getMaxDummyAmmoAmount())
  event.player.message("Ammo restocked!")
}
```

### Force semi-auto on any held gun (tick polling)
```javascript
function init(event) {
  event.npc.getTimers().forceStart(1, 10, true)  // poll every 10 ticks
}

function timer(event) {
  if (event.id != 1) { return }
  var item = event.npc.getMainhandItem()
  var gun  = TimelessAPI.getOptionalGun(item)
  if (gun == null || gun.getFireMode() == 1) { return }
  gun.setFireMode(1)  // 1 = SEMI
}
```

### Make bullets explosive on interact
```javascript
function interact(event) {
  var item = event.player.getInventoryHeldItem()
  var gun  = TimelessAPI.getOptionalGun(item)
  if (gun == null) { return }
  gun.modifyProperty("explode_enabled",          true)
  gun.modifyProperty("explosion_radius",         3.0)
  gun.modifyProperty("explosion_damage",         15.0)
  gun.modifyProperty("explosion_destroys_block", false)
  event.player.message("Explosive rounds loaded!")
}
```

### Timed damage buff (expires via NPC timer)
```javascript
function interact(event) {
  var item = event.player.getInventoryHeldItem()
  var gun  = TimelessAPI.getOptionalGun(item)
  if (gun == null) { return }
  gun.modifyProperty("damage",       30.0)
  gun.modifyProperty("pierce",       3)
  gun.modifyProperty("armor_ignore", 0.5)
  event.player.getTimers().forceStart(99, 200, false)  // 10 seconds
  event.player.message("Power shot active for 10 seconds!")
}

function timer(event) {
  if (event.id != 99) { return }
  var item = event.player.getInventoryHeldItem()
  var gun  = TimelessAPI.getOptionalGun(item)
  if (gun == null) { return }
  gun.modifyProperty("damage",       10.0)
  gun.modifyProperty("pierce",       0)
  gun.modifyProperty("armor_ignore", 0.0)
  event.player.message("Power shot expired.")
}
```

### Warn nearby players about overheating gun (NPC timer)
```javascript
function init(event) {
  event.npc.getTimers().forceStart(1, 20, true)
}

function timer(event) {
  if (event.id != 1) { return }
  var players = event.npc.getWorld().getAllPlayers()
  for (var i = 0; i < players.length; i++) {
    var gun = TimelessAPI.getOptionalGun(players[i].getInventoryHeldItem())
    if (gun != null && gun.hasHeatData() && gun.isOverheatLocked()) {
      players[i].message("Your weapon is overheated!")
    }
  }
}
```

---

## Default TACZ Item IDs (Reference)

> These IDs are for TACZ 1.20.1. Verify against your installed version.

### Firearms
| Role            | Item ID             | Calibre           |
|-----------------|---------------------|-------------------|
| Assault (M4A1)  | `tacz:m4a1`         | 5.56×45mm         |
| Assault (AK-47) | `tacz:ak47`         | 7.62×39mm         |
| SMG (MP5)       | `tacz:mp5`          | 9mm               |
| Sniper (SVD)    | `tacz:svd`          | 7.62×54mm         |
| Sniper (M82)    | `tacz:m82`          | .50 BMG           |
| Launcher (RPG)  | `tacz:rpg7`         | RPG rocket        |
| LMG (M249)      | `tacz:m249`         | 5.56×45mm         |
| Pistol (G17)    | `tacz:glock17`      | 9mm               |
| Pistol (M1911)  | `tacz:m1911`        | .45 ACP           |

### Ammo
| Item ID              | Calibre       |
|----------------------|---------------|
| `tacz:9mm`           | 9mm           |
| `tacz:5_56x45mm`     | 5.56×45mm     |
| `tacz:7_62x39mm`     | 7.62×39mm     |
| `tacz:7_62x54mm`     | 7.62×54mm     |
| `tacz:45acp`         | .45 ACP       |
| `tacz:50bmg`         | .50 BMG       |
| `tacz:rpg_rocket`    | RPG rocket    |

### Melee
| Item ID               | Description   |
|-----------------------|---------------|
| `tacz:combat_knife`   | Combat Knife  |

---

## Delays

TACZ gun state polling on every tick is expensive.
Use CNPC timers to schedule periodic checks:

```javascript
function init(event) {
  event.npc.getTimers().forceStart(1, 20, true)   // every 1 second
}

function timer(event) {
  if (event.id != 1) { return }
  // safe to do gun state checks here
}
```

---

## Reload State Reference

```
0 = RELOAD_IDLE          — not reloading
1 = RELOAD_START         — reload animation beginning
2 = RELOAD_IN_PROGRESS   — mid-reload
3 = RELOAD_END           — reload finishing
```

## Fire Mode Reference

```
0 = AUTO    — hold trigger to fire continuously
1 = SEMI    — one shot per trigger pull
2 = BURST   — fires burst_count rounds per pull
```

## Attachment Slot Reference

```
0 = SCOPE     — magnification / sights
1 = MUZZLE    — suppressor / muzzle brake / flash hider
2 = STOCK     — recoil / ADS speed
3 = GRIP      — underbarrel / foregrip
4 = MAGAZINE  — extended mag / drum mag
5 = LASER     — tactical laser
```

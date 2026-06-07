# PF2e Aztec's Template Wizard

Foundry VTT v14 module for PF2e templates automation.

Template Wizard lets you attach automations to measured templates placed from the descriptions of items, abilities, spells, etc.

## Video showcase

https://youtu.be/0FbubbTjFkg

## Template Automation configuration

You can access the Automation config in any Item's sheet, through the Templates tab (a tab with a magic wand icon)

Each configured Item can define:

- Expiration behaviour.
- Multiple shape variants for the generated region (in case if one item supports multiple shapes, e.g. Wall of Fire). It is important to have a shape defined in Template Automation as it's defined in the Item description (e.g. if the Darkness is a 20-ft burst, then you must define a 20-ft burst in Template Automation)
- Ring interception -- since PF2e is not supporting the Ring shape yet (introduced in V14), this module will intercept any burst placed from the Item where the Ring shape was defined.
- Contiguous placement count (e.g. Grease spell).
- Multiple behaviours attached to region triggers.
- Roll-options and Item filters for requiring or excluding actors from triggering certain behaviours.
- Targeting rules for allies, enemies, or all actors.

## Triggers

- On placement.
- Entering the template.
- Leaving the template.
- Moving within the template.
- Start of turn.
- End of turn.
- Start of round.
- End of round.
- Adjacent at start of turn.
- Adjacent at end of turn.
- While within.
- While adjacent.

## Behaviours

- Saving Throw
- Skill Check
- Choice Set
- Roll Dice
- Deal Damage
- Apply Effect
- Remove Effect
- Add Condition
- Remove Condition
- Apply Rule Element
- Play Sound
- Send Chat Message
- Display Scrolling Text
- Execute Script
- Execute Macro
- Attach Tile
- Attach Sound
- Attach Light
- Attach Walls
   - Single Wall mode allows for placing a single wall on the defined place of the region (top, bottom, left, right).
   - Destructible wall mode creates liked wall actors with configurable HP, AC, hardness, immunities, resistances, weaknesses, and wall Strikes. On destroying the wall actor, the wall is also destroyed.
   - A custom macro in module compendium allows for creating the wall actor out of just a regular wall.
- Heal
- Move
- Restrict (Striking, Spellcasting, etc)

These behaviors support custom chat cards, target rows, rerolls, damage application controls, save consequences, skill consequences, and nested consequences where appropriate.
Attached objects (walls, sounds, tiles, light sources, etc) stay linked to the template region and moves/rotates with the region.

## Heightening

Allows for Heightening for Behaviours and Duration

## Chat Cards

Template Wizard creates focused chat cards for multi-target automation and for keeping the chat cleaner.
Supported custom cards include:

- Saving throws.
- Skill checks.
- Dice rolls with matched consequences.
- Damage rolls.
- Choice Set checks.

Cards can show item descriptions, roll results, save outcomes, damage totals, target rows, reroll buttons, damage application buttons, and inline consequence summaries without flooding chat with separate system messages.

## QoL

- Template placement range limits
- Custom dynamic template placement buttons on chat cards
- Scene-control template browser that allows to place the templates independently from items
- Re-roll via heropoint in special chat cards by RMB on the roll result number
- Sustain automation

## Templates Compendium

- Save item automation to the Templates Compendium.
- Import automation from the Templates Compendium.
- Replace current item automation or append imported automation.
- Create and edit template automations directly in the compendium app.
- Auto-assign saved automations to existing and newly added items by slug.

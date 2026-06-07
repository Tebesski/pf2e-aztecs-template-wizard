import { MODULE_ID } from "../data.mjs"
import {
   escapeHTML,
   getItemDescriptionHTML,
   skillLabelForKey,
} from "./card-helpers.mjs"
import { isTargetHelperEnabled } from "./card-queue-state.mjs"

const SKILL_CHECK_QUEUE = new Map()

export function queueSkillCheckCard({
   tokenDoc,
   actor,
   skill,
   dc,
   item,
   flavor,
   extraRollOptions = [],
   consequences,
   regionUuid,
   queueKey,
}) {
   if (!isTargetHelperEnabled()) return false
   if (!tokenDoc || !actor || !skill) return false
   if (game.user.id !== game.users.activeGM?.id) return true

   const key = [
      "skill",
      item?.uuid ?? "noitem",
      regionUuid ?? "noregion",
      queueKey ?? "default",
      skill,
      String(dc ?? "?"),
      (Array.isArray(extraRollOptions) ? extraRollOptions : []).join(","),
   ].join("|")
   let bucket = SKILL_CHECK_QUEUE.get(key)
   if (!bucket) {
      bucket = {
         skill,
         dc,
         item,
         flavor,
         extraRollOptions: Array.isArray(extraRollOptions)
            ? extraRollOptions
            : [],
         consequences: Array.isArray(consequences) ? consequences : [],
         regionUuid: regionUuid ?? null,
         tokens: new Map(),
         timer: null,
      }
      SKILL_CHECK_QUEUE.set(key, bucket)
   }
   bucket.tokens.set(tokenDoc.id ?? tokenDoc.uuid, tokenDoc)
   if (bucket.timer) clearTimeout(bucket.timer)
   bucket.timer = setTimeout(() => flushSkillCheckBucket(key), 100)
   return true
}

async function flushSkillCheckBucket(key) {
   const bucket = SKILL_CHECK_QUEUE.get(key)
   if (!bucket) return
   SKILL_CHECK_QUEUE.delete(key)

   try {
      const tokenDocs = Array.from(bucket.tokens.values())
      if (!tokenDocs.length) return

      try {
         game.user.updateTokenTargets(tokenDocs.map((td) => td.id).filter(Boolean))
      } catch (_e) {}

      const flavor = bucket.flavor || bucket.item?.name || "Skill Check"
      const itemImg = bucket.item?.img || "icons/svg/d20.svg"
      const descriptionHTML = await getItemDescriptionHTML(bucket.item)
      const descriptionBlock = descriptionHTML
         ? `<section class="card-content atw-mtcard-description" data-auto-collapse>
        ${descriptionHTML}
      </section>`
         : ""
      const skillLabel = skillLabelForKey(bucket.skill)
      const dc = Number(bucket.dc) || 15
      const rows = tokenDocs
         .map((td) => {
            const tName = td.name ?? td.actor?.name ?? "Token"
            return `<div class="target-row atw-mtcard-target-row atw-skill-target-row"
                   data-target-uuid="${escapeHTML(td.uuid)}"
                   data-rolled="false"
                   style="transition: filter 0.3s;">
        <hr>
        <div class="target-header">
          <span class="name">
            <i class="fa-solid fa-ghost"></i>
            ${escapeHTML(tName)}
          </span>
          <span class="controls" data-tooltip-class="pf2e">
            <a class="roll atw-roll-skill"
               data-action="atw-roll-skill"
               data-tooltip="${escapeHTML(skillLabel + " DC " + dc)}">
              <i class="fa-solid fa-dice-d20 die"></i>
              <span class="degree show hidden" style="cursor:pointer;"></span>
            </a>
            <a class="atw-roll-reroll hidden"
               data-action="atw-reroll-skill"
               title="Reroll">
              <i class="fa-solid fa-rotate-right fa-fw"></i>
            </a>
            <hr>
            <a class="atw-mtcard-ping" data-action="atw-ping-target" title="Ping Token">
              <i class="fa-solid fa-fw fa-signal-stream"></i>
            </a>
          </span>
        </div>
        <section class="card-content atw-skill-row-details hidden"></section>
      </div>`
         })
         .join("")

      const content = `<div class="pf2e chat-card item-card atw-mtcard atw-skill-card">
      <header class="card-header flexrow">
        <img src="${escapeHTML(itemImg)}" alt="${escapeHTML(flavor)}">
        <h3>${escapeHTML(flavor)}</h3>
      </header>
      ${descriptionBlock}
      <section class="card-content">
        <p><strong>Check:</strong> ${escapeHTML(skillLabel)} &middot; <strong>DC ${dc}</strong></p>
      </section>
      <div class="pf2e-toolbelt-target-targetRows atw-target-targetRows atw-mtcard-targets">
        ${rows}
      </div>
    </div>`

      await ChatMessage.create({
         author: game.user.id,
         speaker: bucket.item?.actor
            ? ChatMessage.getSpeaker({ actor: bucket.item.actor })
            : { alias: flavor },
         content,
         flags: {
            pf2e: {
               origin: bucket.item?.uuid
                  ? { uuid: bucket.item.uuid }
                  : undefined,
            },
            [MODULE_ID]: {
               skillCard: true,
               rollDiceState: [],
               tokenUuids: tokenDocs.map((td) => td.uuid),
               card: {
                  kind: "skillCheck",
                  skill: bucket.skill,
                  dc,
                  flavor,
                  sourceItemUuid: bucket.item?.uuid ?? null,
                  regionUuid: bucket.regionUuid ?? null,
                  extraRollOptions: bucket.extraRollOptions,
                  consequences: bucket.consequences,
               },
            },
         },
      })
   } catch (e) {
      undefined
   }
}
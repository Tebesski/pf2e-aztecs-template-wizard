import { MODULE_ID } from "../data.mjs"
import {
   escapeHTML,
   getItemDescriptionHTML,
   renderSharedDamageBlock,
   rollDamageFormula,
} from "./card-helpers.mjs"
import { isTargetHelperEnabled } from "./card-queue-state.mjs"

const DAMAGE_CARD_QUEUE = new Map()

export function queueDamageCard({
   tokenDoc,
   actor,
   formula,
   rollOptions = [],
   item,
   flavor,
   regionUuid,
}) {
   if (!isTargetHelperEnabled()) return false
   if (!tokenDoc || !actor || !formula) return false
   if (game.user.id !== game.users.activeGM?.id) return true

   const key = [
      "damage",
      item?.uuid ?? "noitem",
      regionUuid ?? "noregion",
      formula,
      (Array.isArray(rollOptions) ? rollOptions : []).join(","),
   ].join("|")
   let bucket = DAMAGE_CARD_QUEUE.get(key)
   if (!bucket) {
      bucket = {
         formula,
         rollOptions: Array.isArray(rollOptions) ? rollOptions : [],
         item,
         flavor,
         regionUuid: regionUuid ?? null,
         tokens: new Map(),
         timer: null,
      }
      DAMAGE_CARD_QUEUE.set(key, bucket)
   }
   bucket.tokens.set(tokenDoc.id ?? tokenDoc.uuid, tokenDoc)
   if (bucket.timer) clearTimeout(bucket.timer)
   bucket.timer = setTimeout(() => flushDamageCardBucket(key), 100)
   return true
}

async function flushDamageCardBucket(key) {
   const bucket = DAMAGE_CARD_QUEUE.get(key)
   if (!bucket) return
   DAMAGE_CARD_QUEUE.delete(key)

   try {
      const tokenDocs = Array.from(bucket.tokens.values())
      if (!tokenDocs.length) return

      const damageRollData = await rollDamageFormula(
         bucket.formula,
         bucket.rollOptions,
      )
      if (!damageRollData) return

      try {
         game.user.updateTokenTargets(tokenDocs.map((td) => td.id).filter(Boolean))
      } catch (_e) {}

      const flavor = bucket.flavor || bucket.item?.name || "Damage"
      const itemImg = bucket.item?.img || "icons/svg/explosion.svg"
      const descriptionHTML = await getItemDescriptionHTML(bucket.item)
      const descriptionBlock = descriptionHTML
         ? `<section class="card-content atw-mtcard-description" data-auto-collapse>
        ${descriptionHTML}
      </section>`
         : ""
      const damageBlock = renderSharedDamageBlock(damageRollData, "Damage")
      const rows = tokenDocs
         .map((td) => {
            const tName = td.name ?? td.actor?.name ?? "Token"
            const tUuid = td.uuid
            return `<div class="target-row atw-mtcard-target-row"
                   data-target-uuid="${escapeHTML(tUuid)}"
                   data-rolled="true"
                   style="transition: filter 0.3s;">
        <hr>
        <div class="target-header">
          <span class="name">
            <i class="fa-solid fa-ghost"></i>
            ${escapeHTML(tName)}
          </span>
          <span class="controls" data-tooltip-class="pf2e">
            <a class="atw-mtcard-ping" data-action="atw-ping-target" title="Ping Token">
              <i class="fa-solid fa-fw fa-signal-stream"></i>
            </a>
          </span>
        </div>
        <section class="damage-application small atw-mtcard-apply" data-target-uuid="${escapeHTML(tUuid)}" style="transition: filter 0.3s;">
          <button type="button" data-action="atw-apply-damage" data-multiplier="1" title="[Click] Apply full damage to this target.">
            <i class="fa-solid fa-heart-crack fa-fw"></i><span class="label">Damage</span>
          </button>
          <button type="button" class="half-damage" data-action="atw-apply-damage" data-multiplier="0.5" title="[Click] Apply half damage to this target.">
            <i class="fa-solid fa-heart-crack fa-fw"></i><span class="label">Half</span>
          </button>
          <button type="button" data-action="atw-apply-damage" data-multiplier="2" title="[Click] Apply double damage to this target.">
            <img src="systems/pf2e/icons/damage/double.svg"><span class="label">Double</span>
          </button>
        </section>
      </div>`
         })
         .join("")

      const content = `<div class="pf2e chat-card item-card atw-mtcard atw-damage-card">
      <header class="card-header flexrow">
        <img src="${escapeHTML(itemImg)}" alt="${escapeHTML(flavor)}">
        <h3>${escapeHTML(flavor)}</h3>
      </header>
      ${descriptionBlock}
      ${damageBlock}
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
               damageCard: true,
               tokenUuids: tokenDocs.map((td) => td.uuid),
               card: {
                  kind: "damage",
                  flavor,
                  sourceItemUuid: bucket.item?.uuid ?? null,
                  regionUuid: bucket.regionUuid ?? null,
                  damageRoll: damageRollData,
               },
            },
         },
      })
   } catch (e) {
      console.error(`[${MODULE_ID}] damage card creation failed`, e)
   }
}

import { MODULE_ID } from "../data.mjs"
import {
   escapeHTML,
   getItemDescriptionHTML,
   renderSharedDamageBlock,
} from "./card-helpers.mjs"
import { isTargetHelperEnabled } from "./card-queue-state.mjs"

const HEAL_CARD_QUEUE = new Map()

export function queueHealCard({
   tokenDoc,
   actor,
   amount,
   healingType = "untyped",
   item,
   flavor,
   regionUuid,
}) {
   if (!isTargetHelperEnabled()) return false
   if (!tokenDoc || !actor) return false
   const total = Math.max(0, Math.floor(Number(amount) || 0))
   if (total <= 0) return false
   if (game.user.id !== game.users.activeGM?.id) return true

   const type = ["untyped", "vitality", "void"].includes(healingType)
      ? healingType
      : "untyped"
   const key = [
      "heal",
      item?.uuid ?? "noitem",
      regionUuid ?? "noregion",
      total,
      type,
   ].join("|")
   let bucket = HEAL_CARD_QUEUE.get(key)
   if (!bucket) {
      bucket = {
         amount: total,
         healingType: type,
         item,
         flavor,
         regionUuid: regionUuid ?? null,
         tokens: new Map(),
         timer: null,
      }
      HEAL_CARD_QUEUE.set(key, bucket)
   }
   bucket.tokens.set(tokenDoc.id ?? tokenDoc.uuid, tokenDoc)
   if (bucket.timer) clearTimeout(bucket.timer)
   bucket.timer = setTimeout(() => flushHealCardBucket(key), 100)
   return true
}

async function flushHealCardBucket(key) {
   const bucket = HEAL_CARD_QUEUE.get(key)
   if (!bucket) return
   HEAL_CARD_QUEUE.delete(key)

   try {
      const tokenDocs = Array.from(bucket.tokens.values())
      if (!tokenDocs.length) return
      try {
         game.user.updateTokenTargets(tokenDocs.map((token) => token.id).filter(Boolean))
      } catch (_e) {}

      const flavor = bucket.flavor || bucket.item?.name || "Healing"
      const itemImg = bucket.item?.img || "icons/svg/heal.svg"
      const descriptionHTML = await getItemDescriptionHTML(bucket.item)
      const descriptionBlock = descriptionHTML
         ? `<section class="card-content atw-mtcard-description" data-auto-collapse>
        ${descriptionHTML}
      </section>`
         : ""
      const healingData = {
         total: bucket.amount,
         formula: String(bucket.amount),
         instances: [
            {
               formula: String(bucket.amount),
               type: bucket.healingType,
               total: bucket.amount,
            },
         ],
      }
      const healingBlock = renderSharedDamageBlock(healingData, "Healing")
      const rows = tokenDocs
         .map((token) => {
            const targetName = token.name ?? token.actor?.name ?? "Token"
            const targetUuid = token.uuid
            return `<div class="target-row atw-mtcard-target-row"
                   data-target-uuid="${escapeHTML(targetUuid)}"
                   data-rolled="true"
                   style="transition: filter 0.3s;">
        <hr>
        <div class="target-header">
          <span class="name">
            <i class="fa-solid fa-ghost"></i>
            ${escapeHTML(targetName)}
          </span>
          <span class="controls" data-tooltip-class="pf2e">
            <a class="atw-mtcard-ping" data-action="atw-ping-target" title="Ping Token">
              <i class="fa-solid fa-fw fa-signal-stream"></i>
            </a>
          </span>
        </div>
        <section class="damage-application small atw-mtcard-apply" data-target-uuid="${escapeHTML(targetUuid)}" style="transition: filter 0.3s;">
          <button type="button" data-action="atw-apply-healing" data-multiplier="1" title="[Click] Heal this target.">
            <i class="fa-solid fa-heart-pulse fa-fw"></i><span class="label">Heal</span>
          </button>
          <button type="button" class="half-damage" data-action="atw-apply-healing" data-multiplier="0.5" title="[Click] Heal half to this target.">
            <i class="fa-solid fa-heart-pulse fa-fw"></i><span class="label">Half</span>
          </button>
          <button type="button" data-action="atw-apply-healing" data-multiplier="2" title="[Click] Heal double to this target.">
            <img src="systems/pf2e/icons/damage/double.svg"><span class="label">Double</span>
          </button>
        </section>
      </div>`
         })
         .join("")

      const content = `<div class="pf2e chat-card item-card atw-mtcard atw-heal-card">
      <header class="card-header flexrow">
        <img src="${escapeHTML(itemImg)}" alt="${escapeHTML(flavor)}">
        <h3>${escapeHTML(flavor)}</h3>
      </header>
      ${descriptionBlock}
      ${healingBlock}
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
               origin: bucket.item?.uuid ? { uuid: bucket.item.uuid } : undefined,
            },
            [MODULE_ID]: {
               healCard: true,
               tokenUuids: tokenDocs.map((token) => token.uuid),
               card: {
                  kind: "heal",
                  flavor,
                  sourceItemUuid: bucket.item?.uuid ?? null,
                  regionUuid: bucket.regionUuid ?? null,
                  healing: healingData,
               },
            },
         },
      })
   } catch (_e) {}
}

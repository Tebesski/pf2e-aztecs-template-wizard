import { FLAG_SCOPE, MODULE_ID } from "./data.mjs"
import { readAutomation } from "./sheet/automation-storage.mjs"
import { resolveAutomationHeightening } from "./heightening.mjs"
import {
   shapeDataFromVariant,
   shapeLabel,
   shapeSizeLabel,
   currentCanvasLevelIds,
   variantsForAutomation,
} from "./compendium/template-placement.mjs"

const INSTALLED = "__atwChatTemplateButtonsInstalled"

export function registerChatTemplateButtons() {
   if (globalThis[INSTALLED]) return
   globalThis[INSTALLED] = true
   Hooks.on("renderChatMessage", injectTemplateButtons)
   Hooks.on("renderChatMessageHTML", injectTemplateButtons)
   document.addEventListener("click", onPlaceTemplateButton, true)
}

async function injectTemplateButtons(message, html) {
   const root = htmlRoot(html)
   if (!root) return
   const cards = root.matches?.(".pf2e.chat-card")
      ? [root]
      : Array.from(root.querySelectorAll?.(".pf2e.chat-card") ?? [])
   for (const card of cards) {
      try {
         await injectTemplateButtonsIntoCard(card, message)
      } catch (e) {
         undefined
      }
   }
}

async function injectTemplateButtonsIntoCard(card, message = null) {
   if (!isSupportedPf2eCard(card)) return
   if (card.dataset.atwTemplateButtons === "pending") return
   if (card.querySelector(".atw-chat-template-button")) {
      card.dataset.atwTemplateButtons = "ready"
      return
   }

   let injected = false
   card.dataset.atwTemplateButtons = "pending"
   try {
      const item = await itemFromCard(card, message)
      if (!item?.getFlag?.(FLAG_SCOPE, "automation")) return
      if (
         item.actor &&
         !game.user?.isGM &&
         !item.actor.testUserPermission?.(game.user, "OWNER")
      ) {
         return
      }

      const castInfo = spellCastInfoFromCard(card, item)
      const automation = resolvedAutomationForCard(item, castInfo)
      if (!automation?.enabled) return
      const variants = variantsForAutomation(automation)
      if (!variants.length) return

      const existing = existingTemplateButtonLabels(card)
      const buttons = variants
         .map((variant, index) => ({ variant, index, label: placementLabel(variant) }))
         .filter(({ label }) => !existing.has(normalizeLabel(label)))
      if (!buttons.length) return

      const cardButtons = ensureCardButtons(card)
      const ownerButtons = ensureOwnerButtons(cardButtons)
      const spellButton = document.createElement("div")
      spellButton.className = "spell-button atw-chat-template-buttons"
      spellButton.dataset.tooltipClass = "pf2e"
      for (const { index, label } of buttons) {
         const button = document.createElement("button")
         button.type = "button"
         button.className = "atw-chat-template-button"
         button.dataset.action = "atw-place-template-shape"
         button.dataset.itemUuid = item.uuid
         button.dataset.shapeIndex = String(index)
         button.dataset.castInfo = JSON.stringify(castInfo ?? {})
         button.textContent = label
         spellButton.append(button)
      }
      ownerButtons.append(spellButton)
      card.dataset.atwTemplateButtons = "ready"
      injected = true
   } finally {
      if (!injected && card.dataset.atwTemplateButtons === "pending") {
         delete card.dataset.atwTemplateButtons
      }
   }
}

function isSupportedPf2eCard(card) {
   if (!card?.matches?.(".pf2e.chat-card")) return false
   if (card.classList.contains("atw-mtcard")) return false
   if (card.className && String(card.className).includes("atw-")) return false
   if (card.closest(".atw-mtcard")) return false
   return true
}

function htmlRoot(html) {
   if (!html) return null
   if (html instanceof HTMLElement) return html
   if (html instanceof DocumentFragment) return html
   if (html[0] instanceof HTMLElement) return html[0]
   return null
}

async function itemFromCard(card, message = null) {
   const itemUuid =
      card.dataset.itemUuid ??
      card.querySelector("[data-item-uuid]")?.dataset?.itemUuid ??
      message?.flags?.pf2e?.origin?.uuid ??
      message?.flags?.pf2e?.origin?.itemUuid ??
      null
   if (itemUuid) {
      const item = await documentFromUuid(itemUuid)
      if (item) return item
   }
   const actorId = card.dataset.actorId
   const itemId = card.dataset.itemId
   if (actorId && itemId) {
      const actor = game.actors?.get?.(actorId)
      const item = actor?.items?.get?.(itemId)
      if (item) return item
   }
   return null
}

async function documentFromUuid(uuid) {
   if (!uuid) return null
   if (typeof fromUuidSync === "function") {
      try {
         const document = fromUuidSync(uuid)
         if (document) return document
      } catch (_e) {}
   }
   return fromUuid(uuid).catch(() => null)
}

function resolvedAutomationForCard(item, castInfo) {
   const region = castInfo
      ? { getFlag: (scope, key) => scope === FLAG_SCOPE && key === "spellCastHeightening" ? castInfo : null }
      : null
   return resolveAutomationHeightening(readAutomation(item), item, { region })
}

function spellCastInfoFromCard(card, item) {
   const castRank = numberOrNull(card.dataset.castRank)
   if (castRank === null) return null
   const baseRank = baseRankFromCard(card) ?? baseRankFromItem(item)
   return {
      castRank,
      baseRank,
      levels: baseRank === null ? null : Math.max(0, castRank - baseRank),
      actorId: card.dataset.actorId ?? item?.actor?.id ?? null,
      itemId: card.dataset.itemId ?? item?.id ?? null,
      itemUuid: item?.uuid ?? null,
      source: "chat-template-button",
      capturedAt: Date.now(),
   }
}

function baseRankFromCard(card) {
   const footerText = card.querySelector("footer")?.textContent ?? ""
   return numberOrNull(footerText.match(/Base:\s*(\d+)/i)?.[1])
}

function baseRankFromItem(item) {
   return numberOrNull(
      item?.system?.level?.value ??
         item?.system?.level ??
         item?.system?.rank?.value ??
         item?.system?.rank,
   )
}

function existingTemplateButtonLabels(card) {
   const labels = new Set()
   for (const button of card.querySelectorAll("[data-action='spell-template'], [data-action='atw-place-template-shape']")) {
      labels.add(normalizeLabel(button.textContent ?? ""))
   }
   return labels
}

function placementLabel(variant) {
   const type = shapeLabel(variant?.type).toLowerCase()
   const measurement = placementMeasurementLabel(shapeSizeLabel(variant))
   const label = measurement.toLowerCase().endsWith(` ${type}`)
      ? measurement
      : `${measurement} ${type}`
   return `Place ${label}`
}

function placementMeasurementLabel(label) {
   return String(label ?? "")
      .replace(/\b(\d+(?:\.\d+)?)\s*ft\b/gi, "$1-foot")
      .replace(/\s+/g, " ")
      .trim()
}

function normalizeLabel(label) {
   return String(label ?? "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/\s*ft\b/g, "-foot")
      .trim()
}

function ensureCardButtons(card) {
   let cardButtons = card.querySelector(":scope > .card-buttons")
   if (!cardButtons) {
      cardButtons = document.createElement("section")
      cardButtons.className = "card-buttons"
      card.append(cardButtons)
   }
   return cardButtons
}

function ensureOwnerButtons(cardButtons) {
   let ownerButtons = cardButtons.querySelector(":scope > .owner-buttons")
   if (!ownerButtons) {
      ownerButtons = document.createElement("section")
      ownerButtons.className = "owner-buttons"
      cardButtons.append(ownerButtons)
   }
   return ownerButtons
}

async function onPlaceTemplateButton(event) {
   const button = event.target.closest?.("[data-action='atw-place-template-shape']")
   if (!button) return
   event.preventDefault()
   event.stopPropagation()
   const item = await fromUuid(button.dataset.itemUuid).catch(() => null)
   if (!item) return
   let castInfo = null
   try {
      castInfo = JSON.parse(button.dataset.castInfo || "null")
   } catch (_e) {}
   placeItemTemplateVariant(item, Number(button.dataset.shapeIndex) || 0, castInfo)
}

function placeItemTemplateVariant(item, variantIndex, castInfo = null) {
   if (!canvas?.ready || !canvas.regions?.placeRegion) {
      ui.notifications?.warn(
         game.i18n.localize("PF2EATW.TemplatePlacement.OpenScene"),
      )
      return false
   }
   const automation = resolvedAutomationForCard(item, castInfo)
   const variants = variantsForAutomation(automation)
   const variant = variants[Math.max(0, Number(variantIndex) || 0)] ?? variants[0]
   const shape = shapeDataFromVariant(variant)
   if (!shape) return false
   const areaShape = variant?.type === "circle" ? "burst" : variant?.type
   const placementData = {
      name: item.name || "Template",
      shapes: [shape],
      color: game.user.color?.toString?.() ?? "#a728cc",
      highlightMode: "coverage",
      displayMeasurements: true,
      visibility: CONST.REGION_VISIBILITY.ALWAYS,
      flags: {
          [FLAG_SCOPE]: {
             originUuid: item.uuid,
             spellCastHeightening: castInfo ?? undefined,
             placementRange: automation.placementRange ?? undefined,
          },
         pf2e: {
            areaShape,
            origin: { uuid: item.uuid },
         },
      },
   }
   const levels = currentCanvasLevelIds()
   if (levels) placementData.levels = levels
   canvas.regions.placeRegion(placementData)
   return true
}

function numberOrNull(value) {
   if (value === null || value === undefined || value === "") return null
   const number = Number(value)
   return Number.isFinite(number) ? number : null
}

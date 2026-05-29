import { MODULE_ID } from "../data.mjs";

export function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[character]));
}

export function localize(key) {
  return game.i18n.localize(key);
}

export async function renderModuleTemplate(path, data = {}) {
  return renderTemplate(`modules/${MODULE_ID}/templates/${path}`, data);
}

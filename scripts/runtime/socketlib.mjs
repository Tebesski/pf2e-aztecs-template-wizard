import { MODULE_ID } from "../data.mjs"

let SOCKETLIB_SOCKET = null
export function setSocketlibSocket(socket) {
   SOCKETLIB_SOCKET = socket ?? null
}

export async function executeAsGM(handler, ...args) {
   if (!SOCKETLIB_SOCKET) {
      const message = `[${MODULE_ID}] socketlib is not ready; GM-side automation cannot be delegated.`
      ui.notifications?.error(
         "Template Wizard requires socketlib to let players run GM-only automation.",
      )
      throw new Error(message)
   }
   return SOCKETLIB_SOCKET.executeAsGM(handler, ...args)
}

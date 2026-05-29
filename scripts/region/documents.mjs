export async function tryFromUuid(uuid) {
   try {
      const doc = await fromUuid(uuid)
      if (doc?.documentName === "Item") return doc
      return null
   } catch {
      return null
   }
}

export async function tryDocumentFromUuid(uuid) {
   try {
      return uuid ? await fromUuid(uuid) : null
   } catch {
      return null
   }
}

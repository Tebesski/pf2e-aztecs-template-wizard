export function activeDialogUserIdForRegion(region, sourceItem = null) {
   const ownerLevel = CONST.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3
   const ownerships = [region?.ownership, sourceItem?.actor?.ownership]
   for (const ownership of ownerships) {
      if (!ownership || typeof ownership !== "object") continue
      for (const [userId, level] of Object.entries(ownership)) {
         if (userId === "default" || Number(level) < ownerLevel) continue
         const user = game.users.get(userId)
         if (user?.active && !user.isGM) return user.id
      }
   }
   return null
}

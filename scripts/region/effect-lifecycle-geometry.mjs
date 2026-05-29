export function tokenTrackingKey(tokenDoc) {
   const doc = tokenDoc?.document ?? tokenDoc
   if (!doc) return null
   if (doc.uuid) return doc.uuid
   const sceneKey =
      doc.parent?.uuid ??
      doc.parent?.id ??
      globalThis.canvas?.scene?.uuid ??
      "scene"
   return doc.id ? `${sceneKey}.${doc.id}` : null
}

export function getTokenGeometry(tokenDoc, override = null) {
   const doc = tokenDoc?.document ?? tokenDoc
   return {
      x: Number(override?.x ?? tokenDoc?.x ?? doc?.x ?? 0),
      y: Number(override?.y ?? tokenDoc?.y ?? doc?.y ?? 0),
      width: Number(override?.width ?? doc?.width ?? tokenDoc?.width ?? 1),
      height: Number(override?.height ?? doc?.height ?? tokenDoc?.height ?? 1),
   }
}

export function tokenGridSignature(tokenDoc, scene = null) {
   if (!tokenDoc) return ""
   const doc = tokenDoc?.document ?? tokenDoc
   const tokenScene = scene ?? doc?.parent ?? canvas.scene
   const gridSize =
      Number(tokenScene?.grid?.size ?? canvas.scene?.grid?.size ?? 100) || 100
   const geometry = getTokenGeometry(tokenDoc)
   const col = Math.floor(geometry.x / gridSize)
   const row = Math.floor(geometry.y / gridSize)
   return [col, row, geometry.width, geometry.height].join(":")
}

export function tokenGeometryPayload(tokenDoc) {
   const geometry = getTokenGeometry(tokenDoc)
   return {
      x: geometry.x,
      y: geometry.y,
      width: geometry.width,
      height: geometry.height,
   }
}

export function normalizeLifecycleGeometry(geometry) {
   if (!geometry || typeof geometry !== "object") return null
   const x = Number(geometry.x)
   const y = Number(geometry.y)
   const width = Number(geometry.width)
   const height = Number(geometry.height)
   if (![x, y, width, height].every(Number.isFinite)) return null
   return { x, y, width, height }
}

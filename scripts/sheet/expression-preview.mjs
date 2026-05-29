export function checkDependency(system, dep) {
   if (!system || !dep) return true
   for (const [k, v] of Object.entries(dep)) {
      if (system[k] !== v) return false
   }
   return true
}

export function computeExpressionPreview(expr, _item) {
   const str = String(expr ?? "").trim()
   if (!str) return ""
   if (!str.includes("@")) return ""

   const actor = _item?.actor ?? null
   if (!actor) return ""

   const scope = {
      actor,
      placer: actor,
      sourceItem: _item ?? null,
      item: _item ?? null,
      level: actor.level ?? 0,
   }
   const substituted = str.replace(
      /@([a-zA-Z_][\w]*(?:\.[a-zA-Z_][\w]*)*)/g,
      (full, p) => {
         const parts = p.split(".")
         let cur = scope[parts[0]]
         if (cur == null) return "0"
         for (let i = 1; i < parts.length; i++) {
            if (cur == null) return "0"
            cur = cur[parts[i]]
         }
         if (cur == null) return "0"
         const n = Number(cur)
         return Number.isFinite(n) ? String(n) : "0"
      },
   )
   if (/^[\d\s+\-*/().]+$/.test(substituted)) {
      try {
         const v = Function('"use strict"; return (' + substituted + ");")()
         if (Number.isFinite(Number(v))) return `= ${Number(v)}`
      } catch (_e) {}
   }
   return ""
}

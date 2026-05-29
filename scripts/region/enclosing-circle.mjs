export function smallestEnclosingCircle(points) {
   if (!points.length) return null

   const pts = points.slice()
   for (let i = pts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[pts[i], pts[j]] = [pts[j], pts[i]]
   }
   let c = { x: pts[0].x, y: pts[0].y, r: 0 }
   for (let i = 1; i < pts.length; i++) {
      if (!inCircle(c, pts[i])) {
         c = { x: pts[i].x, y: pts[i].y, r: 0 }
         for (let j = 0; j < i; j++) {
            if (!inCircle(c, pts[j])) {
               c = circle2(pts[i], pts[j])
               for (let k = 0; k < j; k++) {
                  if (!inCircle(c, pts[k])) {
                     c = circle3(pts[i], pts[j], pts[k])
                  }
               }
            }
         }
      }
   }
   return c
}

export function inCircle(c, p) {
   return Math.hypot(p.x - c.x, p.y - c.y) <= c.r + 1e-9
}

export function circle2(a, b) {
   return {
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      r: Math.hypot(a.x - b.x, a.y - b.y) / 2,
   }
}

export function circle3(a, b, c) {
   const ax = a.x,
      ay = a.y,
      bx = b.x,
      by = b.y,
      cx = c.x,
      cy = c.y
   const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))
   if (Math.abs(d) < 1e-9) {
      const ab = circle2(a, b),
         bc = circle2(b, c),
         ac = circle2(a, c)
      let best = ab
      if (bc.r > best.r) best = bc
      if (ac.r > best.r) best = ac
      return best
   }
   const ax2 = ax * ax + ay * ay
   const bx2 = bx * bx + by * by
   const cx2 = cx * cx + cy * cy
   const ux = (ax2 * (by - cy) + bx2 * (cy - ay) + cx2 * (ay - by)) / d
   const uy = (ax2 * (cx - bx) + bx2 * (ax - cx) + cx2 * (bx - ax)) / d
   return { x: ux, y: uy, r: Math.hypot(ax - ux, ay - uy) }
}

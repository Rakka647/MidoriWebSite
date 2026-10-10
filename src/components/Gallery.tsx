import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { createPortal } from "react-dom"
import { galleryLabel, type GalleryItem } from "../gallery"
import type { Model } from "../models"

type GalleryProps = {
  items: GalleryItem[]
  models: Model[]
  onOpenModel: (id: string) => void
  onHome: () => void
}

type Slot = {
  key: string
  kind: "photo" | "plus" | "square"
  /** 对应哪一条返图（装饰元素是 -1） */
  entry: number
  /** 在一整块"瓷砖"里的相对位置，0~1 */
  u: number
  v: number
  /** 景深：1 最近（大、清楚、跟手），0 最远（小、虚、慢） */
  d: number
  w: number
  rot: number
  label: boolean
  frame: boolean
  delay: number
}

const MAX_PHOTOS = 220
const DRIFT_X = -9
const DRIFT_Y = -5

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const mod = (value: number, size: number) => ((value % size) + size) % size
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

// 用固定的随机种子摆放：每次打开都是同一幅画面，缩放窗口时也不会乱跳。
function buildSlots(count: number, entryCount: number): Slot[] {
  const rand = mulberry32(20250721)
  const slots: Slot[] = []
  const photoCount = entryCount > 0 ? count : 0

  const order: number[] = []
  while (entryCount > 0 && order.length < photoCount) {
    const pass = Array.from({ length: entryCount }, (_, index) => index)
    for (let index = pass.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(rand() * (index + 1))
      ;[pass[index], pass[swap]] = [pass[swap], pass[index]]
    }
    order.push(...pass)
  }

  const cols = Math.max(1, Math.ceil(Math.sqrt(photoCount * 1.5)))
  const rows = Math.max(1, Math.ceil(photoCount / cols))
  for (let index = 0; index < photoCount; index += 1) {
    const col = index % cols
    const row = Math.floor(index / cols)
    const d = rand()
    slots.push({
      key: `p${index}`,
      kind: "photo",
      entry: order[index],
      u: (col + 0.5 + (rand() - 0.5) * 0.85) / cols,
      v: (row + 0.5 + (rand() - 0.5) * 0.85) / rows,
      d,
      w: (74 + Math.pow(d, 1.15) * 146) * (0.9 + rand() * 0.25),
      rot: (rand() - 0.5) * 16,
      label: d > 0.72 && rand() < 0.3,
      frame: d > 0.62 && rand() < 0.3,
      delay: rand() * 900,
    })
  }

  const plusCount = Math.round(count * 0.4)
  for (let index = 0; index < plusCount; index += 1) {
    const d = rand()
    slots.push({
      key: `x${index}`,
      kind: "plus",
      entry: -1,
      u: rand(),
      v: rand(),
      d,
      w: 12 + d * 10,
      rot: 0,
      label: false,
      frame: false,
      delay: rand() * 900,
    })
  }
  for (let index = 0; index < 4; index += 1) {
    slots.push({
      key: `s${index}`,
      kind: "square",
      entry: -1,
      u: rand(),
      v: rand(),
      d: 0.8,
      w: 10 + rand() * 8,
      rot: 0,
      label: false,
      frame: false,
      delay: rand() * 900,
    })
  }
  return slots
}

/** 几条装饰用的细线：把相邻的近景图片连起来。 */
function buildLines(slots: Slot[]) {
  const near = slots.map((slot, index) => ({ slot, index })).filter(({ slot }) => slot.kind === "photo" && slot.d > 0.45)
  const used = new Set<number>()
  const lines: [number, number][] = []
  for (const a of near) {
    if (lines.length >= 12) break
    if (used.has(a.index) || a.index % 3 !== 0) continue
    let best: { index: number; dist: number } | null = null
    for (const b of near) {
      if (b.index === a.index || used.has(b.index)) continue
      const dist = Math.hypot((a.slot.u - b.slot.u) * 1.5, a.slot.v - b.slot.v)
      if (!best || dist < best.dist) best = { index: b.index, dist }
    }
    if (best && best.dist < 0.3) {
      used.add(a.index)
      used.add(best.index)
      lines.push([a.index, best.index])
    }
  }
  return lines
}

function baseFilter(d: number) {
  if (d >= 0.72) return "none"
  const t = d / 0.72
  return `blur(${((1 - t) * 3.2).toFixed(1)}px) brightness(${(0.5 + t * 0.5).toFixed(2)})`
}

export function Gallery({ items, models, onOpenModel, onHome }: GalleryProps) {
  const [view, setView] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const [shotReady, setShotReady] = useState(false)
  const [cardMin, setCardMin] = useState(false)

  useEffect(() => {
    let timer = 0
    const onResize = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setView({ w: window.innerWidth, h: window.innerHeight }), 120)
    }
    window.addEventListener("resize", onResize)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener("resize", onResize)
    }
  }, [])

  useEffect(() => {
    document.documentElement.classList.add("is-gallery")
    return () => document.documentElement.classList.remove("is-gallery")
  }, [])

  useEffect(() => {
    setShotReady(false)
  }, [openIndex])

  // 画面比例：窄屏时图片整体缩小、数量也相应减少
  const scale = Math.round(clamp(view.w / 1280, 0.62, 1.1) * 20) / 20
  const margin = 280 * scale
  const tileW = Math.max(1600 * scale, view.w + margin * 2)
  const tileH = Math.max(1100 * scale, view.h + margin * 2)
  const count = clamp(Math.round(((tileW * tileH) / (25000 * scale * scale)) / 6) * 6, 36, MAX_PHOTOS)

  const slots = useMemo(() => buildSlots(count, items.length), [count, items.length])
  const lines = useMemo(() => buildLines(slots), [slots])

  const stageRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const nodes = useRef<(HTMLElement | null)[]>([])
  const lineNodes = useRef<(SVGLineElement | null)[]>([])
  const live = useRef({
    panX: 0,
    panY: 0,
    velX: 0,
    velY: 0,
    parX: 0,
    parY: 0,
    mx: -9999,
    my: -9999,
    inside: false,
    dragging: false,
    moved: false,
    paused: false,
    hover: -1,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    lastT: 0,
    tile: { w: tileW, h: tileH, margin, scale },
    // 每个元素当前的画面状态
    ox: new Float32Array(0),
    oy: new Float32Array(0),
    sc: new Float32Array(0),
    rt: new Float32Array(0),
    dm: new Float32Array(0),
    ap: new Float32Array(0),
    ratio: new Float32Array(0),
    cx: new Float32Array(0),
    cy: new Float32Array(0),
  })

  useEffect(() => {
    live.current.tile = { w: tileW, h: tileH, margin, scale }
    live.current.paused = openIndex !== null
  }, [tileW, tileH, margin, scale, openIndex])

  useEffect(() => {
    const s = live.current
    const n = slots.length
    s.ox = new Float32Array(n)
    s.oy = new Float32Array(n)
    s.sc = new Float32Array(n).fill(1)
    s.rt = Float32Array.from(slots.map((slot) => slot.rot))
    s.dm = new Float32Array(n).fill(1)
    s.ap = new Float32Array(n)
    s.ratio = new Float32Array(n).fill(0.75)
    s.cx = new Float32Array(n)
    s.cy = new Float32Array(n)
    s.hover = -1
    // 图片可能在这之前就加载完了（节点被复用），按它们现在的真实比例补上
    for (let i = 0; i < n; i += 1) {
      const image = nodes.current[i]?.querySelector("img")
      if (image && image.complete && image.naturalWidth) {
        s.ratio[i] = clamp(image.naturalHeight / image.naturalWidth, 0.6, 1.4)
      }
    }
  }, [slots])

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const s = live.current
    const stage = stageRef.current
    const start = performance.now()
    let last = start
    let raf = 0
    let prevHover = -1
    let cursor = ""

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const { w: W, h: H, margin: M, scale: F } = s.tile
      const vw = window.innerWidth
      const vh = window.innerHeight

      if (!s.dragging) {
        s.panX += s.velX * dt
        s.panY += s.velY * dt
        const friction = Math.exp(-dt * 3.2)
        s.velX *= friction
        s.velY *= friction
        if (!reduced && !s.paused) {
          s.panX += DRIFT_X * dt
          s.panY += DRIFT_Y * dt
        }
      }
      const kPar = 1 - Math.exp(-dt * 4)
      const wantX = s.inside && !s.paused ? s.mx / vw - 0.5 : 0
      const wantY = s.inside && !s.paused ? s.my / vh - 0.5 : 0
      s.parX += (wantX - s.parX) * kPar
      s.parY += (wantY - s.parY) * kPar

      const card = cardRef.current?.getBoundingClientRect()
      const overCard = Boolean(card && s.mx >= card.left && s.mx <= card.right && s.my >= card.top && s.my <= card.bottom)
      const canHover = s.inside && !s.paused && !(s.dragging && s.moved) && !overCard

      // 第一遍：算每个元素的位置，找出鼠标正压着的那一张
      let hover = -1
      let hoverDepth = -1
      for (let i = 0; i < slots.length; i += 1) {
        const slot = slots[i]
        const parallax = 0.55 + 0.45 * slot.d
        const w = slot.w * F
        const h = slot.kind === "photo" ? w * s.ratio[i] : w
        const x = mod(slot.u * W + s.panX * parallax, W) - M
        const y = mod(slot.v * H + s.panY * parallax, H) - M
        s.cx[i] = x + w / 2 + s.parX * (slot.d - 0.5) * 44
        s.cy[i] = y + h / 2 + s.parY * (slot.d - 0.5) * 44
        const appear = reduced ? 1 : clamp((now - start - slot.delay) / 650, 0, 1)
        s.ap[i] = 1 - Math.pow(1 - appear, 3)
        if (canHover && slot.kind === "photo" && s.ap[i] > 0.6) {
          const hw = (w * s.sc[i]) / 2
          const hh = (h * s.sc[i]) / 2
          if (
            Math.abs(s.mx - (s.cx[i] + s.ox[i])) < hw &&
            Math.abs(s.my - (s.cy[i] + s.oy[i])) < hh &&
            slot.d > hoverDepth
          ) {
            hover = i
            hoverDepth = slot.d
          }
        }
      }
      s.hover = hover

      // 第二遍：以鼠标（或被压着的那张）为中心，把周围的图片轻轻拨开
      let srcX = s.mx
      let srcY = s.my
      let reach = 150 * F
      let force = 70 * F
      const hasSource = canHover
      if (hover >= 0) {
        srcX = s.cx[hover]
        srcY = s.cy[hover]
        reach = (140 + slots[hover].w * 1.0) * F
        force = 190 * F
      }

      for (let i = 0; i < slots.length; i += 1) {
        const slot = slots[i]
        const el = nodes.current[i]
        if (!el) continue
        const w = slot.w * F
        const h = slot.kind === "photo" ? w * s.ratio[i] : w

        let targetX = 0
        let targetY = 0
        let targetScale = 1
        let targetRot = slot.rot
        if (hasSource && i !== hover) {
          const dx = s.cx[i] - srcX
          const dy = s.cy[i] - srcY
          const dist = Math.hypot(dx, dy) || 1
          const f = Math.pow(Math.max(0, 1 - dist / reach), 2)
          targetX = (dx / dist) * f * force
          targetY = (dy / dist) * f * force
          targetScale = 1 - f * 0.12
        }
        if (i === hover) {
          targetScale = 1.42
          targetRot = 0
        }
        const dimTarget = hover >= 0 && i !== hover && slot.kind === "photo" ? 0.7 : 1

        const k = reduced ? 1 : 1 - Math.exp(-dt * (i === hover ? 14 : 9))
        s.ox[i] += (targetX - s.ox[i]) * k
        s.oy[i] += (targetY - s.oy[i]) * k
        s.sc[i] += (targetScale - s.sc[i]) * k
        s.rt[i] += (targetRot - s.rt[i]) * k
        s.dm[i] += (dimTarget - s.dm[i]) * k

        const grow = 0.7 + 0.3 * s.ap[i]
        el.style.transform = `translate3d(${(s.cx[i] - w / 2 + s.ox[i]).toFixed(1)}px,${(s.cy[i] - h / 2 + s.oy[i]).toFixed(1)}px,0) rotate(${s.rt[i].toFixed(2)}deg) scale(${(s.sc[i] * grow).toFixed(3)})`
        const base = slot.kind === "photo" ? 0.55 + 0.45 * slot.d : 0.25 + 0.55 * slot.d
        el.style.opacity = (s.ap[i] * base * s.dm[i]).toFixed(3)
      }

      if (hover !== prevHover) {
        const before = prevHover >= 0 ? nodes.current[prevHover] : null
        const after = hover >= 0 ? nodes.current[hover] : null
        if (before) {
          before.classList.remove("is-hover")
          before.style.zIndex = String(Math.round(slots[prevHover].d * 100) + 1)
          before.style.filter = baseFilter(slots[prevHover].d)
          before.style.opacity = ""
        }
        if (after) {
          after.classList.add("is-hover")
          after.style.zIndex = "300"
          after.style.filter = "none"
        }
        prevHover = hover
      }

      // 装饰细线
      for (let l = 0; l < lines.length; l += 1) {
        const line = lineNodes.current[l]
        if (!line) continue
        const [a, b] = lines[l]
        const dist = Math.hypot(s.cx[a] - s.cx[b], s.cy[a] - s.cy[b])
        const show = dist < 520 * F && s.ap[a] > 0.9 && s.ap[b] > 0.9
        line.setAttribute("x1", s.cx[a].toFixed(1))
        line.setAttribute("y1", s.cy[a].toFixed(1))
        line.setAttribute("x2", s.cx[b].toFixed(1))
        line.setAttribute("y2", s.cy[b].toFixed(1))
        line.style.opacity = show ? "1" : "0"
      }

      if (stage) {
        const next = s.dragging && s.moved ? "grabbing" : hover >= 0 ? "pointer" : "grab"
        if (next !== cursor) {
          stage.style.cursor = next
          cursor = next
        }
      }
      raf = window.requestAnimationFrame(tick)
    }
    raf = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(raf)
  }, [slots, lines])

  // 滚轮 / 触控板也可以拖动画面；方向键同理
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const s = live.current
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return
      event.preventDefault()
      s.panX -= event.deltaX
      s.panY -= event.deltaY
      s.velX = clamp(s.velX - event.deltaX * 3, -2400, 2400)
      s.velY = clamp(s.velY - event.deltaY * 3, -2400, 2400)
    }
    stage.addEventListener("wheel", onWheel, { passive: false })
    return () => stage.removeEventListener("wheel", onWheel)
  }, [])

  useEffect(() => {
    const s = live.current
    const onKey = (event: KeyboardEvent) => {
      if (openIndex !== null) {
        if (event.key === "Escape") setOpenIndex(null)
        else if (items.length > 1 && event.key === "ArrowRight") setOpenIndex((value) => (((value ?? 0) + 1) % items.length))
        else if (items.length > 1 && event.key === "ArrowLeft") setOpenIndex((value) => (((value ?? 0) - 1 + items.length) % items.length))
        return
      }
      const step = 900
      if (event.key === "ArrowLeft") s.velX += step
      else if (event.key === "ArrowRight") s.velX -= step
      else if (event.key === "ArrowUp") s.velY += step
      else if (event.key === "ArrowDown") s.velY -= step
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [openIndex, items.length])

  function hitTest(x: number, y: number) {
    const s = live.current
    const card = cardRef.current?.getBoundingClientRect()
    if (card && x >= card.left && x <= card.right && y >= card.top && y <= card.bottom) return -1
    let found = -1
    let depth = -1
    for (let i = 0; i < slots.length; i += 1) {
      const slot = slots[i]
      if (slot.kind !== "photo" || s.ap[i] < 0.5) continue
      const w = slot.w * s.tile.scale
      const h = w * s.ratio[i]
      const hw = (w * s.sc[i]) / 2
      const hh = (h * s.sc[i]) / 2
      if (Math.abs(x - (s.cx[i] + s.ox[i])) < hw && Math.abs(y - (s.cy[i] + s.oy[i])) < hh && slot.d > depth) {
        found = i
        depth = slot.d
      }
    }
    return found
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return
    const s = live.current
    s.dragging = true
    s.moved = false
    s.startX = s.lastX = s.mx = event.clientX
    s.startY = s.lastY = s.my = event.clientY
    s.lastT = performance.now()
    s.velX = 0
    s.velY = 0
    s.inside = true
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // 某些浏览器里指针已经结束，忽略
    }
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const s = live.current
    s.mx = event.clientX
    s.my = event.clientY
    s.inside = true
    if (!s.dragging) return
    const now = performance.now()
    const dx = event.clientX - s.lastX
    const dy = event.clientY - s.lastY
    const seconds = Math.max(0.001, (now - s.lastT) / 1000)
    s.panX += dx
    s.panY += dy
    s.velX = clamp(s.velX * 0.55 + (dx / seconds) * 0.45, -3200, 3200)
    s.velY = clamp(s.velY * 0.55 + (dy / seconds) * 0.45, -3200, 3200)
    if (Math.hypot(event.clientX - s.startX, event.clientY - s.startY) > 6) s.moved = true
    s.lastX = event.clientX
    s.lastY = event.clientY
    s.lastT = now
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const s = live.current
    if (!s.dragging) return
    s.dragging = false
    if (performance.now() - s.lastT > 90) {
      s.velX = 0
      s.velY = 0
    }
    if (!s.moved) {
      const hit = hitTest(event.clientX, event.clientY)
      if (hit >= 0 && slots[hit].entry >= 0) setOpenIndex(slots[hit].entry)
    }
    if (event.pointerType !== "mouse") {
      s.inside = false
      s.mx = s.my = -9999
    }
  }

  function onPointerLeave(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && !live.current.dragging) {
      live.current.inside = false
      live.current.mx = live.current.my = -9999
    }
  }

  const open = openIndex !== null ? items[openIndex] : null
  const used = open ? open.models.map((id) => models.find((model) => model.id === id)).filter((model): model is Model => Boolean(model)) : []

  return createPortal(
    <div className={`gal${open ? " is-open" : ""}${cardMin ? " is-card-min" : ""}`}>
      <div
        ref={stageRef}
        className="gal-stage"
        role="region"
        aria-label="返图展示：拖动浏览，点击图片查看详情"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={onPointerLeave}
      >
        <svg className="gal-lines" aria-hidden="true">
          {lines.map(([a, b], index) => (
            <line key={`${a}-${b}`} ref={(node) => { lineNodes.current[index] = node }} />
          ))}
        </svg>
        {slots.map((slot, index) => {
          if (slot.kind !== "photo") {
            return (
              <span
                key={slot.key}
                ref={(node) => { nodes.current[index] = node }}
                className={`gal-deco is-${slot.kind}`}
                style={{ width: slot.w * scale, height: slot.w * scale, zIndex: Math.round(slot.d * 100) + 1 }}
                aria-hidden="true"
              />
            )
          }
          const item = items[slot.entry]
          return (
            <div
              key={slot.key}
              ref={(node) => { nodes.current[index] = node }}
              className={`gal-photo${slot.frame ? " has-frame" : ""}`}
              style={{ width: slot.w * scale, zIndex: Math.round(slot.d * 100) + 1, filter: baseFilter(slot.d) }}
            >
              <img
                src={item.thumb || item.image}
                alt=""
                draggable={false}
                decoding="async"
                onLoad={(event) => {
                  const image = event.currentTarget
                  if (!image.naturalWidth) return
                  const ratio = clamp(image.naturalHeight / image.naturalWidth, 0.6, 1.4)
                  if (index < live.current.ratio.length) live.current.ratio[index] = ratio
                  const box = nodes.current[index]
                  if (box) box.style.aspectRatio = `1 / ${ratio}`
                }}
              />
              {slot.label ? <span className="gal-tag">{galleryLabel(item)}</span> : null}
            </div>
          )
        })}
      </div>

      {cardMin ? (
        <button className="gal-dock" type="button" aria-label="展开标题" onClick={() => setCardMin(false)}>
          <span className="gal-dock-bar" aria-hidden="true" />
          <span>
            <strong>返图展示</strong>
            <small>GALLERY</small>
          </span>
        </button>
      ) : (
        <div ref={cardRef} className="gal-card">
          <button className="gal-card-x" type="button" aria-label="收起标题" onClick={() => setCardMin(true)}>
            ×
          </button>
          <div className="gal-card-body">
            <p className="gal-card-kicker">
              <i aria-hidden="true" />
              MIDORI AVATARS
            </p>
            <h1>
              <i aria-hidden="true" />
              返图展示
            </h1>
            <span className="gal-card-eng">CUSTOMER PHOTOS</span>
            <p className="gal-card-sub">来自使用 Midori 模型的大家</p>
            {items.length === 0 ? <span className="gal-empty">还没有返图，敬请期待</span> : null}
          </div>
        </div>
      )}

      <header className="gal-bar">
        <button className="gal-brand" type="button" onClick={onHome}>
          <span className="gal-mark">M:D:R</span>
          <span className="gal-brand-meta">
            <strong>MIDORI</strong>
            <small>VRChat Avatar</small>
          </span>
        </button>
        <nav className="gal-nav">
          <button className="gal-link" type="button" onClick={onHome}>
            <strong>模型展示</strong>
            <small>AVATARS</small>
          </button>
          <button className="gal-link is-on" type="button" aria-current="page">
            <strong>返图展示</strong>
            <small>GALLERY</small>
          </button>
        </nav>
      </header>

      <div className="gal-hint" aria-hidden="true">
        <svg viewBox="0 0 16 16">
          <path d="M8 1v14M1 8h14" />
        </svg>
        <span>DRAG TO EXPLORE</span>
        <i />
      </div>
      <div className="gal-sign" aria-hidden="true">
        <span className="gal-bars" />
        <span>
          <strong>MIDORI</strong>
          <small>CUSTOMER PHOTOS</small>
        </span>
        <em>///</em>
      </div>

      {open ? (
        <div className="gal-modal" role="dialog" aria-modal="true" aria-label="返图详情" onClick={() => setOpenIndex(null)}>
          <div className="gal-win" key={open.id} onClick={(event) => event.stopPropagation()}>
            <header className="gal-win-bar">
              <span>
                @{open.author} / {open.date}
              </span>
              <button className="gal-win-x" type="button" aria-label="关闭" autoFocus onClick={() => setOpenIndex(null)}>
                ×
              </button>
            </header>
            <div className={`gal-win-shot${shotReady ? " is-ready" : ""}`}>
              <img
                src={open.image}
                alt={`${open.author} 的返图`}
                onLoad={() => setShotReady(true)}
                ref={(node) => {
                  if (node?.complete && node.naturalWidth) setShotReady(true)
                }}
              />
              {items.length > 1 ? (
                <>
                  <button
                    className="gal-step is-prev"
                    type="button"
                    aria-label="上一张"
                    onClick={() => setOpenIndex(((openIndex ?? 0) - 1 + items.length) % items.length)}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M14 6l-6 6 6 6" />
                    </svg>
                  </button>
                  <button
                    className="gal-step is-next"
                    type="button"
                    aria-label="下一张"
                    onClick={() => setOpenIndex(((openIndex ?? 0) + 1) % items.length)}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M10 6l6 6-6 6" />
                    </svg>
                  </button>
                </>
              ) : null}
            </div>
            {used.length ? (
              <footer className="gal-win-used gal-used">
                <h3>
                  <i aria-hidden="true" />
                  使用模型 <small>/ USED AVATAR</small>
                </h3>
                {used.map((model) => (
                  <button key={model.id} className="gal-model" type="button" onClick={() => onOpenModel(model.id)}>
                    {model.images[0] ? <img src={model.images[0]} alt="" /> : <span className="gal-model-ph" />}
                    <span>
                      <strong>{model.name}</strong>
                      <small>by {model.author || "Midori"}</small>
                    </span>
                    <svg viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M6 3H3v10h10v-3M9 2h5v5M14 2L7 9" />
                    </svg>
                  </button>
                ))}
              </footer>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>,
    document.body,
  )
}

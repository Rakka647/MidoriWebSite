import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { displayPrice, erpTag, formatDescription, modelTags, models, type Model } from "../models"
import { serverLikes, useFavorites, useLikes } from "../favorites"

type DetailProps = {
  model: Model
  onHome: () => void
  onOpen: (id: string) => void
  onPickTag: (tag: string) => void
  onMissingLink: () => void
}

function infoRows(model: Model) {
  return [
    ["作者", model.author || "Midori"],
    ["支持平台", model.platform || "PC / VR (VRChat)"],
    ["下载大小", model.download || "—"],
    ["显存大小", model.vram || "—"],
  ]
}

// 按标签相似度推荐：共同标签越多越靠前；同样多时优先同类（ERP / 无 ERP），再按编号靠近程度。
function relatedModels(model: Model) {
  const own = modelTags(model)
  const mine = new Set(own)
  const serial = (item: Model) => parseInt(item.code.replace(/\D/g, ""), 10) || 0
  return models
    .filter((item) => item.id !== model.id)
    .map((item) => {
      const theirs = modelTags(item)
      const shared = theirs.filter((tag) => mine.has(tag)).length
      const union = new Set([...own, ...theirs]).size || 1
      return {
        item,
        score: shared / union,
        sameErp: item.erp === model.erp ? 1 : 0,
        gap: Math.abs(serial(item) - serial(model)),
      }
    })
    .sort((a, b) => b.score - a.score || b.sameErp - a.sameErp || a.gap - b.gap)
    .slice(0, 5)
    .map(({ item }) => item)
}

// 闲鱼链接在这里统一兜底；单个模型可在 models.json 里写 "link" 覆盖。
const XIANYU_LINK = ""

function HeartIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={filled ? "is-filled" : undefined}>
      <path d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 4.6-7 9-7 9z" />
    </svg>
  )
}

function StarIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={filled ? "is-filled" : undefined}>
      <path d="M12 3.6l2.5 5.3 5.8.7-4.3 4 1.1 5.7L12 16.7l-5.1 2.6 1.1-5.7-4.3-4 5.8-.7z" />
    </svg>
  )
}

function Chevron({ dir }: { dir: "up" | "down" | "left" | "right" }) {
  const d =
    dir === "up" ? "M6 14l6-6 6 6" : dir === "down" ? "M6 10l6 6 6-6" : dir === "left" ? "M14 6l-6 6 6 6" : "M10 6l6 6-6 6"
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

const THUMB_COPIES = 5
const THUMB_SIZE = 54
const THUMB_GAP = 6
const THUMB_PIXELS = 128
const smallThumbCache = new Map<string, string>()

async function makeSmallThumb(src: string) {
  const image = new Image()
  image.src = src
  await image.decode()
  const canvas = document.createElement("canvas")
  canvas.width = THUMB_PIXELS
  canvas.height = THUMB_PIXELS
  const ctx = canvas.getContext("2d")
  if (!ctx || !image.naturalWidth) return src
  const scale = Math.max(THUMB_PIXELS / image.naturalWidth, THUMB_PIXELS / image.naturalHeight)
  const width = image.naturalWidth * scale
  const height = image.naturalHeight * scale
  ctx.drawImage(image, (THUMB_PIXELS - width) / 2, (THUMB_PIXELS - height) / 2, width, height)
  return canvas.toDataURL("image/webp", 0.72)
}

function useSmallThumbs(srcs: string[]) {
  const [ready, setReady] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    for (const src of srcs) {
      const hit = smallThumbCache.get(src)
      if (hit) map[src] = hit
    }
    return map
  })

  useEffect(() => {
    let live = true
    const unique = [...new Set(srcs.filter(Boolean))]
    void (async () => {
      for (const src of unique) {
        if (smallThumbCache.has(src)) continue
        try {
          smallThumbCache.set(src, await makeSmallThumb(src))
        } catch {
          smallThumbCache.set(src, src)
        }
        if (!live) return
        const map: Record<string, string> = {}
        for (const item of unique) {
          const hit = smallThumbCache.get(item)
          if (hit) map[item] = hit
        }
        setReady(map)
      }
    })()
    return () => {
      live = false
    }
  }, [srcs])

  return ready
}

export function Detail({ model, onOpen, onPickTag, onMissingLink }: DetailProps) {
  const images = model.images.length ? model.images : [""]
  const n = images.length
  const [cursor, setCursor] = useState(() => n * 2)
  const [zoom, setZoom] = useState(false)
  const [jump, setJump] = useState(false)
  const [thumbMetric, setThumbMetric] = useState({ item: THUMB_SIZE, gap: THUMB_GAP, view: 0, row: false })
  const thumbsRef = useRef<HTMLDivElement>(null)
  const frozenTrack = useRef<{ offset: number; cursor: number } | null>(null)
  const smallThumbs = useSmallThumbs(model.images)
  const [tips, setTips] = useState<{ like?: string; fav?: string }>({})
  const favorites = useFavorites()
  const saved = favorites.has(model.id)
  const likes = useLikes()
  // 显示 = 服务器点赞数 + 自己在这个浏览器里点的那一次（只能点一次，不能取消）。
  const likeOf = (id: string) => serverLikes(id) + (likes.has(id) ? 1 : 0)
  const link = model.link || XIANYU_LINK
  const others = relatedModels(model)
  // 名字下面的小标签：素体、ERP（点一下回首页按它筛选）
  const bodyPills = model.bodies?.length ? model.bodies : model.series ? [model.series] : []
  const pills = [...bodyPills, ...(erpTag(model.erp) ? [erpTag(model.erp) as string] : [])]
  const copyHtml = formatDescription(model.description)
  const shot = n ? ((cursor % n) + n) % n : 0
  const image = images[Math.min(shot, n - 1)]
  const [liteSrc, setLiteSrc] = useState(image)
  const stride = thumbMetric.item + thumbMetric.gap
  const trackOffset = cursor * stride - (thumbMetric.view / 2 - thumbMetric.item / 2)
  const listOffset = zoom ? (frozenTrack.current?.offset ?? trackOffset) : trackOffset
  const listCursor = zoom ? (frozenTrack.current?.cursor ?? cursor) : cursor
  const thumbReach = Math.max(6, Math.ceil((thumbMetric.view || 1) / Math.max(stride, 1)) + 3)
  const trackItems = n
    ? Array.from({ length: n * THUMB_COPIES }, (_, pos) => ({
        pos,
        index: pos % n,
        src: images[pos % n],
      }))
    : []

  function openZoom() {
    if (!image) return
    frozenTrack.current = { offset: trackOffset, cursor }
    setZoom(true)
  }

  function closeZoom() {
    frozenTrack.current = null
    setJump(true)
    setZoom(false)
  }

  const move = useCallback((delta: number) => {
    if (n <= 1 || !delta) return
    setCursor((current) => current + delta)
  }, [n])

  useEffect(() => {
    setJump(true)
    setCursor(n * 2)
  }, [model.id, n])

  useLayoutEffect(() => {
    if (!jump) return
    const frame = requestAnimationFrame(() => setJump(false))
    return () => cancelAnimationFrame(frame)
  }, [jump])

  function settleTrack() {
    if (n <= 1 || zoom) return
    const lo = n
    const hi = n * (THUMB_COPIES - 1)
    if (cursor >= lo && cursor < hi) return
    setJump(true)
    setCursor(((cursor % n) + n) % n + n * 2)
  }

  useLayoutEffect(() => {
    const el = thumbsRef.current
    if (!el) return

    const measure = () => {
      const row = getComputedStyle(el).flexDirection === "row"
      const thumb = el.querySelector(".d-thumb") as HTMLElement | null
      const track = el.querySelector(".d-thumb-track") as HTMLElement | null
      const view = el.querySelector(".d-thumb-view") as HTMLElement | null
      const item = (row ? thumb?.offsetWidth : thumb?.offsetHeight) || THUMB_SIZE
      const gap = track ? Number.parseFloat(getComputedStyle(track).gap) || THUMB_GAP : THUMB_GAP
      const span = (row ? view?.clientWidth : view?.clientHeight) || 0
      setThumbMetric({ item, gap, view: span, row })
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [n])

  useEffect(() => {
    if (n <= 1 || zoom) return
    const timer = window.setInterval(() => move(1), 6000)
    return () => window.clearInterval(timer)
  }, [n, model.id, shot, move, zoom])

  useEffect(() => {
    const nearby = zoom ? [shot - 1, shot, shot + 1] : [shot]
    for (const index of nearby) {
      const src = images[((index % n) + n) % n]
      if (!src) continue
      const preload = new Image()
      preload.src = src
    }
  }, [images, n, shot, zoom])

  useEffect(() => {
    if (!zoom) {
      setLiteSrc(image)
      return
    }
    let live = true
    const preload = new Image()
    preload.src = image
    const apply = () => {
      if (live) setLiteSrc(image)
    }
    if (preload.complete) apply()
    else preload.onload = apply
    return () => {
      live = false
      preload.onload = null
    }
  }, [image, zoom])

  function flash(key: "like" | "fav", text: string) {
    setTips((current) => ({ ...current, [key]: text }))
    window.setTimeout(() => {
      setTips((current) => ({ ...current, [key]: undefined }))
    }, 1400)
  }

  useEffect(() => {
    if (!zoom) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeZoom()
      else if (event.key === "ArrowLeft") move(-1)
      else if (event.key === "ArrowRight") move(1)
    }
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener("keydown", onKey)
    }
  }, [zoom, move])

  return (
    <main className="view d-page">
      <section className="d-hero">
        <div className="d-show">
          <div className="d-thumbs" ref={thumbsRef}>
            <button className="d-thumb-nav" type="button" aria-label="上一张" onClick={() => move(-1)}>
              <Chevron dir={thumbMetric.row ? "left" : "up"} />
            </button>
            <div className="d-thumb-view">
              <div
                className={`d-thumb-track${jump || zoom ? " is-jump" : ""}`}
                style={{ transform: thumbMetric.row ? `translate3d(${-listOffset}px,0,0)` : `translate3d(0,${-listOffset}px,0)` }}
                onTransitionEnd={(event) => {
                  if (event.target === event.currentTarget) settleTrack()
                }}
              >
                {trackItems.map(({ pos, index, src }) => (
                  <button
                    key={pos}
                    className={`d-thumb${pos === listCursor ? " is-on" : ""}`}
                    type="button"
                    onClick={() => move(pos - cursor)}
                  >
                    {src && smallThumbs[src] && Math.abs(pos - listCursor) <= thumbReach ? (
                      <img
                        src={smallThumbs[src]}
                        alt={`${model.name} ${index + 1}`}
                        width={THUMB_PIXELS}
                        height={THUMB_PIXELS}
                        decoding="async"
                        draggable={false}
                      />
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
            <button className="d-thumb-nav" type="button" aria-label="下一张" onClick={() => move(1)}>
              <Chevron dir={thumbMetric.row ? "right" : "down"} />
            </button>
          </div>

          <figure
            className={`d-stage${image ? " is-zoomable" : ""}`}
            onClick={openZoom}
          >
            {image ? <img src={image} alt={model.name} /> : null}
            <span className="d-count">
              {shot + 1} / {images.length}
            </span>
            <span className="d-expand" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </span>
            <span className="d-plus d-plus-tl">+</span>
            <span className="d-plus d-plus-br">+</span>
            <span className="d-mark">
              M:D:R
              <small>
                VRCHAT
                <br />
                AVATAR
                <br />
                ORIGINAL
                <br />
                2025
              </small>
            </span>
            <span className="d-sign">{model.name}</span>
          </figure>
        </div>

        <aside className="d-buy">
          <p className="d-serial">/// {model.code || "#001"}</p>
          <h1>{model.name}</h1>
          <div className="d-pills">
            {pills.map((label) => (
              <button key={label} type="button" onClick={() => onPickTag(label)}>
                {label}
              </button>
            ))}
          </div>
          {model.versions?.length ? (
            <div className="d-prices">
              {model.versions.map((version, index) => (
                <div key={`${version.name}-${index}`}>
                  <span>{version.name}</span>
                  <b>{version.price}</b>
                </div>
              ))}
            </div>
          ) : null}
          <div className="d-actions">
            <button
              className="d-get"
              type="button"
              onClick={() => {
                if (link) window.open(link, "_blank", "noopener,noreferrer")
                else onMissingLink()
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M14 5h5v5" />
                <path d="M19 5 10 14" />
                <path d="M19 13v5H6V6h5" />
              </svg>
              获取模型
            </button>
            <span className="d-ico-wrap">
              {tips.like ? <em className="d-tip">{tips.like}</em> : null}
              <button
                className={`d-ico d-ico-like${likes.has(model.id) ? " is-on" : ""}`}
                type="button"
                aria-pressed={likes.has(model.id)}
                aria-label={likes.has(model.id) ? "取消点赞" : "点赞"}
                title={likes.has(model.id) ? "取消点赞" : "点赞"}
                onClick={() => {
                  const on = likes.has(model.id)
                  likes.toggle(model.id)
                  if (!on) flash("like", "点赞成功")
                }}
              >
                <HeartIcon filled={likes.has(model.id)} />
                <b>{likeOf(model.id)}</b>
              </button>
            </span>
            <span className="d-ico-wrap">
              {tips.fav ? <em className="d-tip">{tips.fav}</em> : null}
              <button
                className={`d-ico d-ico-fav${saved ? " is-on" : ""}`}
                type="button"
                aria-pressed={saved}
                aria-label={saved ? "取消收藏" : "收藏"}
                title={saved ? "取消收藏" : "收藏"}
                onClick={() => {
                  const on = saved
                  favorites.toggle(model.id)
                  if (!on) flash("fav", "收藏成功")
                }}
              >
                <StarIcon filled={saved} />
              </button>
            </span>
          </div>
        </aside>
      </section>

      <section className="d-split">
        <article className="d-card">
          <header>
            <i />
            <b>详情介绍</b>
            <em>// Description</em>
            <button type="button" aria-label="关闭">
              ×
            </button>
          </header>
          <div className="d-copy">
            {copyHtml.trim() ? <div dangerouslySetInnerHTML={{ __html: copyHtml }} /> : <p>介绍还空着。</p>}
          </div>
        </article>

        <article className="d-card">
          <header>
            <i />
            <b>模型情報</b>
            <em>// Model Info</em>
            <button type="button" aria-label="关闭">
              ×
            </button>
          </header>
          <dl className="d-info">
            {infoRows(model).map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </article>
      </section>

      <section className="d-card d-tags">
        <header>
          <i />
          <b>标签</b>
          <em>// Tags</em>
        </header>
        <div className="d-tag-row">
          {modelTags(model).map((tag) => (
            <button key={tag} type="button" onClick={() => onPickTag(tag)}>
              {tag}
            </button>
          ))}
        </div>
      </section>

      <section className="d-card d-related">
        <header>
          <i />
          <b>相关模型</b>
          <em>// Related Items</em>
          <button type="button" aria-label="关闭">
            ×
          </button>
        </header>
        <div className="d-rel-wrap">
          <button className="d-rel-arrow" type="button" aria-label="上一组">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M14 6l-6 6 6 6" />
            </svg>
          </button>
          <div className="d-rel-row">
            {others.map((item) => (
              <button key={item.id} className="d-rel" type="button" onClick={() => onOpen(item.id)}>
                <span className="d-rel-pic">{item.images[0] ? <img src={item.images[0]} alt={item.name} decoding="async" /> : null}</span>
                <span className="d-rel-meta">
                  <strong>{item.name}</strong>
                  <em>{displayPrice(item)}</em>
                  <span
                    className={`d-like${likes.has(item.id) ? " is-on" : ""}`}
                    role="button"
                    tabIndex={0}
                    aria-pressed={likes.has(item.id)}
                    aria-label="点赞"
                    onClick={(event) => {
                      event.stopPropagation()
                      likes.toggle(item.id)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault()
                        event.stopPropagation()
                        likes.toggle(item.id)
                      }
                    }}
                  >
                    <HeartIcon filled={likes.has(item.id)} />
                    {likeOf(item.id)}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <button className="d-rel-arrow" type="button" aria-label="下一组">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M10 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      </section>

      {zoom && liteSrc
        ? createPortal(
            <div className="lightbox" role="dialog" aria-modal="true" onClick={closeZoom}>
              <img src={liteSrc} alt={model.name} onClick={(event) => event.stopPropagation()} />
              <button className="lightbox-close" type="button" aria-label="关闭" onClick={closeZoom}>
                ×
              </button>
              {images.length > 1 ? (
                <>
                  <button
                    className="lightbox-nav is-prev"
                    type="button"
                    aria-label="上一张"
                    onClick={(event) => {
                      event.stopPropagation()
                      move(-1)
                    }}
                  >
                    <Chevron dir="left" />
                  </button>
                  <button
                    className="lightbox-nav is-next"
                    type="button"
                    aria-label="下一张"
                    onClick={(event) => {
                      event.stopPropagation()
                      move(1)
                    }}
                  >
                    <Chevron dir="right" />
                  </button>
                </>
              ) : null}
              <span className="lightbox-count">
                {shot + 1} / {images.length}
              </span>
            </div>,
            document.body,
          )
        : null}
    </main>
  )
}

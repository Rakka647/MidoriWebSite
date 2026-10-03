import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { createPortal } from "react-dom"
import { bannerModels, displayPrice, matchesPicked, modelTags, tagLevels, type ErpFilter, type Model } from "../models"
import { useFavorites } from "../favorites"

type HomeProps = {
  models: Model[]
  onOpen: (id: string) => void
  picked: string[]
  onPicked: (tags: string[]) => void
  erpFilter: ErpFilter
  onErpFilter: (filter: ErpFilter) => void
  tagOpen: boolean
  onTagOpen: (open: boolean) => void
}

type Slide = { id: string; src: string }

const SLIDE_MS = 820

// 每张图自带一条向左延伸的模糊色带（由图片最左边一条像素拉伸而成），
// 色带和图片绑在一起，图片滑到哪里它就跟到哪里；只有主图（和正在滑出的那张）显示色带。
function Photo({ src }: { src: string }) {
  return (
    <>
      <span className="photo-ext" aria-hidden="true">
        <span className="photo-ext-slice">
          <img src={src} alt="" />
        </span>
        <span className="photo-ext-body">
          <img src={src} alt="" />
        </span>
      </span>
      <img src={src} alt="" />
    </>
  )
}

function BannerReel({ slides, index, onOpen }: { slides: Slide[]; index: number; onOpen: (id: string) => void }) {
  const prevRef = useRef(index)
  const [motion, setMotion] = useState<{ from: number; to: number; on: boolean } | null>(null)

  useEffect(() => {
    const from = prevRef.current
    if (from === index || slides.length === 0) return
    let cancelled = false
    const isStep = (from + 1) % slides.length === index
    if (!isStep || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      prevRef.current = index
      setMotion(null)
      return
    }
    setMotion({ from, to: index, on: false })
    let frame = 0
    frame = window.requestAnimationFrame(() => {
      frame = window.requestAnimationFrame(() => {
        if (cancelled) return
        prevRef.current = index
        setMotion({ from, to: index, on: true })
      })
    })
    const done = window.setTimeout(() => {
      if (!cancelled) setMotion(null)
    }, SLIDE_MS + 40)
    return () => {
      cancelled = true
      window.cancelAnimationFrame(frame)
      window.clearTimeout(done)
    }
  }, [index, slides.length])

  const total = slides.length
  if (!total) return <div className="photos" />
  // 点横幅上的任意一张图，直接打开它对应的模型。
  const openProps = (id: string) => ({
    role: "link" as const,
    tabIndex: 0,
    onClick: () => onOpen(id),
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === "Enter") onOpen(id)
    },
  })
  const at = (value: number) => slides[((value % total) + total) % total]

  if (!motion) {
    return (
      <div className="photos">
        {(["main", "a", "b"] as const).map((slot, offset) => {
          const slide = at(index + offset)
          return (
            <figure key={slide.id} className={`photo-item slot-${slot}`} {...openProps(slide.id)}>
              <Photo src={slide.src} />
            </figure>
          )
        })}
      </div>
    )
  }

  const startSlot = ["main", "a", "b", "enter"] as const
  const endSlot = ["exit", "main", "a", "b"] as const
  return (
    <div className="photos">
      {[0, 1, 2, 3].map((delta) => {
        const slide = at(motion.from + delta)
        const slot = motion.on ? endSlot[delta] : startSlot[delta]
        return (
          <figure
            key={slide.id}
            className={`photo-item slot-${slot}${motion.on ? "" : " is-prep"}`}
            {...openProps(slide.id)}
          >
            <Photo src={slide.src} />
          </figure>
        )
      })}
    </div>
  )
}

const PAGE_SIZE = 15

// 卡片底部显示这个模型随机的三个标签（每次打开页面重新抽，同一次访问里保持不变）。
function randomTags(model: Model, seed: number) {
  const score = (tag: string) => {
    let hash = Math.floor(seed * 1e9)
    for (const char of model.id + tag) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
    return hash
  }
  const pool = [...(model.colors ?? []), ...model.tags]
  return pool.sort((a, b) => score(a) - score(b)).slice(0, 3)
}

function pageNumbers(current: number, count: number): (number | null)[] {
  if (count <= 7) return Array.from({ length: count }, (_, index) => index)
  const keep = new Set([0, count - 1, current - 1, current, current + 1])
  const list: (number | null)[] = []
  for (let index = 0; index < count; index += 1) {
    if (keep.has(index)) list.push(index)
    else if (list[list.length - 1] !== null) list.push(null)
  }
  return list
}

function pad(value: number) {
  return String(value).padStart(2, "0")
}

function erpBadge(erp: boolean | null) {
  if (erp === true) return "可ERP"
  if (erp === false) return "无ERP"
  return "未标注"
}

const SHOP_LINK = "https://www.goofish.com/personal?spm=a21ybx.home.nav.1.4c053da6GMjw4U"

export function SideRail({ onCatalog }: { onCatalog: () => void }) {
  const [group, setGroup] = useState(false)

  useEffect(() => {
    if (!group) return
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setGroup(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [group])

  return createPortal(
    <>
      <aside className="rail">
        <button type="button" aria-label="目录" onClick={onCatalog}>
          <svg className="dots" viewBox="0 0 24 24" aria-hidden="true">
            {[5, 12, 19].flatMap((cy) => [5, 12, 19].map((cx) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.9" />))}
          </svg>
        </button>
        <a href={SHOP_LINK} target="_blank" rel="noopener noreferrer">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 8h14l-1 11H6z" />
            <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
          </svg>
          <span>闲鱼店铺</span>
          <em>↗</em>
        </a>
        <button className="is-soon" type="button">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3.5" y="7" width="17" height="11" rx="2" />
            <path d="M8 4l3 3M16 4l-3 3" />
            <circle cx="9" cy="12.5" r="0.9" />
            <circle cx="15" cy="12.5" r="0.9" />
          </svg>
          <span>B站账号</span>
          <em>↗</em>
        </button>
        <button type="button" onClick={() => setGroup(true)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="9" cy="9" r="2.8" />
            <circle cx="16.5" cy="10" r="2.2" />
            <path d="M3.5 19c.5-2.8 2.7-4.4 5.5-4.4s5 1.6 5.5 4.4" />
            <path d="M15 15.2c2.6-.3 4.8 1 5.5 3.8" />
          </svg>
          <span>通知群</span>
        </button>
      </aside>
      {group ? (
        <div className="notice" role="dialog" aria-modal="true" onClick={() => setGroup(false)}>
          <div className="notice-box qr-box" onClick={(event) => event.stopPropagation()}>
            <button className="qr-x" type="button" aria-label="关闭" onClick={() => setGroup(false)}>
              ×
            </button>
            <i aria-hidden="true" />
            <strong>通知群</strong>
            <p>用微信或 QQ 扫码加入。</p>
            <div className="qr-row">
              <figure>
                <img src="/qr/wechat.png" alt="微信二维码" />
                <figcaption>微信</figcaption>
              </figure>
              <figure>
                <img src="/qr/qq.png" alt="QQ 群二维码" />
                <figcaption>QQ 群 1128251942</figcaption>
              </figure>
            </div>
            <button type="button" autoFocus onClick={() => setGroup(false)}>
              关闭
            </button>
          </div>
        </div>
      ) : null}
    </>,
    document.body,
  )
}

export function Home({ models, onOpen, picked, onPicked, erpFilter: filter, onErpFilter: setFilter, tagOpen, onTagOpen }: HomeProps) {
  // 横幅循环播放四个模型：管理员固定的（最多两个）+ 其余里编号最大的，每个模型取第一张图。
  const slides = useMemo<Slide[]>(
    () => bannerModels(models).map((model) => ({ id: model.id, src: model.images[0] })),
    [models],
  )
  const total = slides.length
  const [index, setIndex] = useState(0)
  const [query, setQuery] = useState("")
  const [onlyFav, setOnlyFav] = useState(false)
  const favorites = useFavorites()
  // 收藏过、后来被删掉的模型不算数
  const favoriteCount = favorites.list.filter((id) => models.some((model) => model.id === id)).length

  useEffect(() => {
    if (!picked.length && filter === "all") return
    document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth" })
    // Only when this page opens with a tag already chosen, not on later toggles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (total <= 1) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % total), 4600)
    return () => window.clearInterval(timer)
  }, [total, index])

  const levels = useMemo(() => tagLevels(models), [models])

  const visible = useMemo(() => {
    const word = query.trim().toLowerCase()
    return models.filter((model) => {
      if (filter === "erp" && model.erp !== true) return false
      if (filter === "plain" && model.erp !== false) return false
      if (onlyFav && !favorites.list.includes(model.id)) return false
      if (!matchesPicked(model, picked, levels)) return false
      if (!word) return true
      const haystack = [model.name, model.series, model.code, ...modelTags(model)].join(" ").toLowerCase()
      return haystack.includes(word)
    })
  }, [favorites.list, filter, levels, models, onlyFav, picked, query])

  // 每页 5 × 3 = 15 个；筛选条件变了就回到第一页。
  const [page, setPage] = useState(0)
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const current = Math.min(page, pageCount - 1)
  const pageItems = visible.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)
  const tagSeed = useRef(Math.random())

  useEffect(() => {
    setPage(0)
  }, [filter, onlyFav, picked, query])

  function goPage(next: number) {
    setPage(Math.max(0, Math.min(pageCount - 1, next)))
    document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth" })
  }

  return (
    <main className="view studio">
      <div className="home-row">
        <section className="showcase">
          <div className="showcase-stage">
            <BannerReel slides={slides} index={index} onOpen={onOpen} />
            <div className="pager">
              {slides.map((slide, dash) => (
                <button
                  key={slide.id}
                  type="button"
                  className={dash === index ? "is-on" : ""}
                  aria-label={`第 ${dash + 1} 个模型`}
                  onClick={() => setIndex(dash)}
                />
              ))}
            </div>
            <div className="showcase-copy">
              <i className="hero-bar" aria-hidden="true" />
              <h1>MIDORI</h1>
              <p className="showcase-kicker">V R C h a t 成 品 模 型</p>
              <i className="hero-rule" aria-hidden="true" />
              <p className="showcase-id">
                <b>闲鱼id：</b>Midori
              </p>
              <p className="showcase-note">
                欢迎光临Midori的模型屋 <span className="note-heart">💚</span>
                <br />
                点击查看详情可查看对应模型信息，
                <br />
                点击获取模型即可跳转到闲鱼对应商品下单链接~
              </p>
              <div className="explore-row">
                <button
                  className="explore"
                  type="button"
                  onClick={() => document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth" })}
                >
                  <svg className="explore-x" viewBox="0 0 20 20" aria-hidden="true">
                    <path d="M3 3h5v5H3zM12 3h5v5h-5zM3 12h5v5H3zM12 12h5v5h-5z" />
                  </svg>
                  探索更多
                  <span className="explore-go">↗</span>
                </button>
                <span className="explore-plus" aria-hidden="true">+</span>
                <span className="mini-kicker">
                  CUTE
                  <br />×<br />
                  DARK
                  <br />×<br />
                  VIRTUAL
                </span>
              </div>
            </div>
          </div>
        </section>
      </div>
      <div className="sheet-anchor">
        <section className="sheet" id="catalog">
        <div className="sheet-head">
          <h2>
            <i />
            模型一览
            <small>// Avatars</small>
          </h2>
          <label className="finder">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="6" />
              <path d="M16 16l4 4" />
            </svg>
            <input value={query} placeholder="搜索..." onChange={(event) => setQuery(event.target.value)} />
          </label>
        </div>

        <div className="sheet-tools">
          <div className="chips">
            <button className={`chip${filter === "all" ? " is-on" : ""}`} type="button" onClick={() => setFilter("all")}>
              全部
            </button>
            <button className={`chip${filter === "erp" ? " is-on" : ""}`} type="button" onClick={() => setFilter("erp")}>
              erp模型
            </button>
            <button className={`chip${filter === "plain" ? " is-on" : ""}`} type="button" onClick={() => setFilter("plain")}>
              无erp模型
            </button>
          </div>
          <div className="chips">
            <button
              className={`chip${onlyFav ? " is-on" : ""}`}
              type="button"
              aria-pressed={onlyFav}
              onClick={() => setOnlyFav(!onlyFav)}
            >
              {onlyFav ? "♥" : "♡"} 我的收藏
              {favoriteCount ? <em className="tag-count">{favoriteCount}</em> : null}
            </button>
            <button
              className={`chip${tagOpen ? " is-on" : ""}`}
              type="button"
              aria-expanded={tagOpen}
              onClick={() => onTagOpen(!tagOpen)}
            >
              ▽ 更多筛选
              {picked.length ? <em className="tag-count">{picked.length}</em> : null}
            </button>
          </div>
        </div>

        <div className={`tag-panel${tagOpen ? " is-open" : ""}`}>
          <div className="tag-panel-clip">
            <div className="tag-panel-body">
              <div className="tag-panel-head">
                <span>筛选</span>
                <button type="button" onClick={() => onPicked([])} disabled={!picked.length}>
                  清除
                </button>
              </div>
              <div className="tag-levels">
                {levels.map((level, order) => (
                  <div className="tag-level" key={level.id}>
                    <span className="tag-level-name">
                      <em>{String(order + 1).padStart(2, "0")}</em>
                      {level.label}
                    </span>
                    <div className="tag-picks">
                      {level.tags.map((tag) => {
                        const on = picked.includes(tag)
                        return (
                          <button
                            key={tag}
                            className={`tag${on ? " is-on" : ""}`}
                            type="button"
                            aria-pressed={on}
                            onClick={() =>
                              onPicked(picked.includes(tag) ? picked.filter((item) => item !== tag) : [...picked, tag])
                            }
                          >
                            {tag}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="grid-empty">{onlyFav && !favoriteCount ? "还没有收藏，去详情页点「收藏」吧。" : "没有符合条件的模型。"}</p>
        ) : null}
        <div className="grid">
          {pageItems.map((model) => (
            <button key={model.id} className="card work" type="button" onClick={() => onOpen(model.id)}>
              <span className="frame">
                {model.images[0] ? <img src={model.images[0]} alt={model.name} loading="lazy" decoding="async" /> : null}
              </span>
              <span className="work-meta">
                <span className="work-name">
                  <strong>{model.name}</strong>
                  <span className={`badge${model.erp === true ? "" : " is-off"}`}>{erpBadge(model.erp)}</span>
                </span>
                <em>{displayPrice(model)}</em>
              </span>
              <span className="work-foot">
                {randomTags(model, tagSeed.current).map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </span>
            </button>
          ))}
        </div>

        {pageCount > 1 ? (
          <nav className="pagination" aria-label="翻页">
            <button type="button" aria-label="上一页" disabled={current === 0} onClick={() => goPage(current - 1)}>
              ‹
            </button>
            {pageNumbers(current, pageCount).map((entry, position) =>
              entry === null ? (
                <span key={`gap-${position}`} className="pagination-gap">
                  …
                </span>
              ) : (
                <button
                  key={entry}
                  type="button"
                  className={entry === current ? "is-on" : ""}
                  aria-current={entry === current ? "page" : undefined}
                  onClick={() => goPage(entry)}
                >
                  {pad(entry + 1)}
                </button>
              ),
            )}
            <button type="button" aria-label="下一页" disabled={current === pageCount - 1} onClick={() => goPage(current + 1)}>
              ›
            </button>
          </nav>
        ) : null}
      </section>
      </div>
    </main>
  )
}

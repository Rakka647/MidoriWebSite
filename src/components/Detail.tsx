import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { displayPrice, erpTag, fullImage, modelTags, models, type Model } from "../models"
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
    ["対応プラットフォーム", model.platform || "PC / VR (VRChat)"],
    ["バージョン", "1.0.0"],
    ["ダウンロードサイズ", model.download || "—"],
    ["VRAM 使用量（目安）", model.vram || "—"],
    ["更新日", "—"],
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

export function Detail({ model, onOpen, onPickTag, onMissingLink }: DetailProps) {
  const images = model.images.length ? model.images : [""]
  const [shot, setShot] = useState(0)
  const [zoom, setZoom] = useState(false)
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
  const paragraphs = model.description.split("\n").map((line) => line.trim()).filter(Boolean)
  const image = images[Math.min(shot, images.length - 1)]
  const zoomImage = fullImage(model, Math.min(shot, images.length - 1)) || image

  useEffect(() => {
    setShot(0)
  }, [model.id])

  function flash(key: "like" | "fav", text: string) {
    setTips((current) => ({ ...current, [key]: text }))
    window.setTimeout(() => {
      setTips((current) => ({ ...current, [key]: undefined }))
    }, 1400)
  }

  function step(delta: number) {
    setShot((current) => (current + delta + images.length) % images.length)
  }

  useEffect(() => {
    if (!zoom) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setZoom(false)
      else if (event.key === "ArrowLeft") setShot((current) => (current - 1 + images.length) % images.length)
      else if (event.key === "ArrowRight") setShot((current) => (current + 1) % images.length)
    }
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener("keydown", onKey)
    }
  }, [zoom, images.length])

  return (
    <main className="view d-page">
      <section className="d-hero">
        <div className="d-thumbs">
          <button className="d-thumb-nav" type="button" aria-label="上一张" onClick={() => step(-1)}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 14l6-6 6 6" />
            </svg>
          </button>
          <div className="d-thumb-list">
            {images.map((src, index) => (
              <button
                key={`${src}-${index}`}
                className={`d-thumb${index === shot ? " is-on" : ""}`}
                type="button"
                onClick={() => setShot(index)}
              >
                {src ? <img src={src} alt={`${model.name} ${index + 1}`} loading="lazy" decoding="async" /> : null}
              </button>
            ))}
          </div>
          <button className="d-thumb-nav" type="button" aria-label="下一张" onClick={() => step(1)}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 10l6 6 6-6" />
            </svg>
          </button>
        </div>

        <figure
          className={`d-stage${image ? " is-zoomable" : ""}`}
          onClick={() => {
            if (image) setZoom(true)
          }}
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
                <path d="M12 4v11" />
                <path d="m8 11 4 4 4-4" />
                <path d="M5 19h14" />
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
            {paragraphs.length ? (
              paragraphs.map((line, index) => <p key={index}>{line}</p>)
            ) : (
              <p>介绍还空着。</p>
            )}
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
                <span className="d-rel-pic">{item.images[0] ? <img src={item.images[0]} alt={item.name} loading="lazy" decoding="async" /> : null}</span>
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

      {zoom && zoomImage
        ? createPortal(
            <div className="lightbox" role="dialog" aria-modal="true" onClick={() => setZoom(false)}>
              <img src={zoomImage} alt={model.name} onClick={(event) => event.stopPropagation()} />
              <button className="lightbox-close" type="button" aria-label="关闭" onClick={() => setZoom(false)}>
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
                      step(-1)
                    }}
                  >
                    ‹
                  </button>
                  <button
                    className="lightbox-nav is-next"
                    type="button"
                    aria-label="下一张"
                    onClick={(event) => {
                      event.stopPropagation()
                      step(1)
                    }}
                  >
                    ›
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

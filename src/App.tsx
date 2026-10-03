import { useEffect, useLayoutEffect, useState } from "react"
import { Header } from "./components/Header"
import { Detail } from "./components/Detail"
import { Home, SideRail } from "./components/Home"
import { ERP_NO, ERP_YES, models, type ErpFilter } from "./models"

type Screen =
  | { name: "home" }
  | { name: "detail"; id: string }

function readScreen(): Screen {
  let hash = ""
  try {
    hash = decodeURIComponent(window.location.hash.replace(/^#/, ""))
  } catch {
    // 地址栏里的 # 后面不是合法编码，当作没有
  }
  // 只认真实存在的模型；模型被删掉后旧链接会回到首页
  if (hash && models.some((model) => model.id === hash)) return { name: "detail", id: hash }
  return { name: "home" }
}

function hashFor(screen: Screen) {
  if (screen.name === "home") return ""
  return `#${screen.id}`
}

type Theme = "light" | "dark"

function readTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light"
}

function screenKey(screen: Screen) {
  if (screen.name === "home") return "home"
  return `detail:${screen.id}`
}

export default function App() {
  const [screen, setScreen] = useState<Screen>(readScreen)
  const [shown, setShown] = useState(screen)
  const [leaving, setLeaving] = useState(false)
  const [theme] = useState<Theme>(readTheme)
  const [picked, setPicked] = useState<string[]>([])
  const [tagOpen, setTagOpen] = useState(false)
  const [erpFilter, setErpFilter] = useState<ErpFilter>("all")
  const [canScroll, setCanScroll] = useState(false)
  const [canTop, setCanTop] = useState(false)

  // 「返图展示」和「暗色模式」还没做，点了先弹出提示
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!notice) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNotice(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [notice])

  useEffect(() => {
    const onHash = () => setScreen(readScreen())
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])

  useLayoutEffect(() => {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual"
    const top = () => window.scrollTo(0, 0)
    top()
    const frame = window.requestAnimationFrame(top)
    const timer = window.setTimeout(top, 80)
    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    const measure = () => {
      const left = document.documentElement.scrollHeight - window.scrollY - window.innerHeight
      setCanScroll(left > 80)
      setCanTop(window.scrollY > 240)
    }
    measure()
    window.addEventListener("scroll", measure, { passive: true })
    window.addEventListener("resize", measure)
    const watch = window.setInterval(measure, 600)
    return () => {
      window.removeEventListener("scroll", measure)
      window.removeEventListener("resize", measure)
      window.clearInterval(watch)
    }
  }, [])

  useEffect(() => {
    if (screenKey(screen) === screenKey(shown)) return
    setLeaving(true)
    const timer = window.setTimeout(() => {
      setShown(screen)
      setLeaving(false)
      window.scrollTo(0, 0)
    }, 280)
    return () => window.clearTimeout(timer)
  }, [screen, shown])

  function go(next: Screen) {
    const hash = hashFor(next)
    if ((window.location.hash || "") !== hash) window.location.hash = hash
    else setScreen(next)
  }

  const selected = shown.name === "detail" ? models.find((model) => model.id === shown.id) : null

  useEffect(() => {
    document.title = selected ? `${selected.name} — MIDORI` : "M:D:R — MIDORI"
  }, [selected])

  return (
    <>
      <div className="atmosphere" aria-hidden="true" />
      <div className="backdrop" aria-hidden="true">
        <span className="stroke s1" />
        <span className="stroke s2" />
        <span className="stroke s3" />
        <span className="stroke s4" />
        <span className="mark-plus a">+</span>
        <span className="mark-plus b">+</span>
        <span className="mark-plus c">+</span>
        <span className="mark-plus d">+</span>
      </div>
      <div className="grain" aria-hidden="true" />
      <div className="shell">
        <div className="edge-lines" aria-hidden="true">
          <i className="line-long" />
          <i className="line-mid" />
          <i className="line-short" />
        </div>
        <SideRail
          onCatalog={() => {
            const catalog = document.getElementById("catalog")
            if (catalog) catalog.scrollIntoView({ behavior: "smooth" })
            else go({ name: "home" })
          }}
        />
        <Header
          theme={theme}
          onGallery={() => setNotice("返图展示")}
          onToggleTheme={() => setNotice("暗色模式")}
          onHome={() => go({ name: "home" })}
        />
        <div key={screenKey(shown)} className={`screen${leaving ? " is-leaving" : ""}`}>
          {selected ? (
            <Detail
              model={selected}
              onHome={() => go({ name: "home" })}
              onOpen={(id) => go({ name: "detail", id })}
              onPickTag={(tag) => {
                // ERP 标签对应首页的「全部 / erp模型 / 无erp模型」选项，其余标签进「更多筛选」
                if (tag === ERP_YES || tag === ERP_NO) {
                  setPicked([])
                  setErpFilter(tag === ERP_YES ? "erp" : "plain")
                } else {
                  setPicked([tag])
                  setErpFilter("all")
                  setTagOpen(true)
                }
                go({ name: "home" })
              }}
            />
          ) : (
            <Home
              models={models}
              picked={picked}
              onPicked={setPicked}
              erpFilter={erpFilter}
              onErpFilter={setErpFilter}
              tagOpen={tagOpen}
              onTagOpen={setTagOpen}
              onOpen={(id) => go({ name: "detail", id })}
            />
          )}
        </div>
      </div>
      <div className="scroll-dock">
        <button
          className={`scroll-btn scroll-up${canTop ? " is-on" : ""}`}
          type="button"
          aria-label="返回顶部"
          tabIndex={canTop ? 0 : -1}
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 19V6" />
            <path d="m6 11 6-6 6 6" />
          </svg>
        </button>
        <button
          className={`scroll-btn scroll-down${canScroll ? " is-on" : ""}`}
          type="button"
          aria-label="向下滚动"
          tabIndex={canScroll ? 0 : -1}
          onClick={() => window.scrollBy({ top: Math.round(window.innerHeight * 0.85), behavior: "smooth" })}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v13" />
            <path d="m6 13 6 6 6-6" />
          </svg>
        </button>
      </div>
      {notice ? (
        <div className="notice" role="dialog" aria-modal="true" onClick={() => setNotice(null)}>
          <div className="notice-box" onClick={(event) => event.stopPropagation()}>
            <i aria-hidden="true" />
            <strong>{notice}</strong>
            <p>这个功能还没有实现，敬请期待。</p>
            <button type="button" autoFocus onClick={() => setNotice(null)}>
              知道了
            </button>
          </div>
        </div>
      ) : null}
    </>
  )
}

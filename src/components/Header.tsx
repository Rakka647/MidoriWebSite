type HeaderProps = {
  theme: "light" | "dark"
  onToggleTheme: () => void
  onGallery: () => void
  onHome: () => void
}

export function Header({ theme, onToggleTheme, onGallery, onHome }: HeaderProps) {
  return (
    <header className="header bar">
      <button className="brand" type="button" onClick={onHome}>
        <span className="brand-meta">
          <strong>MIDORI</strong>
          <small>VRChat Avatar</small>
        </span>
      </button>
      <nav className="bar-nav">
        <button className="bar-link is-on" type="button" onClick={onHome}>
          <strong>成品模型</strong>
          <small>AVATARS</small>
        </button>
        <button className="bar-link" type="button" onClick={onGallery}>
          <strong>返图展示</strong>
          <small>GALLERY</small>
          <i />
        </button>
        <button className="bar-icon" type="button" aria-label="菜单">
          <span className="burger" />
        </button>
      </nav>
      <div className="utility-dock is-soon">
        <button
          className="bar-icon"
          type="button"
          aria-label={theme === "light" ? "切换到暗色模式" : "切换到亮色模式"}
          onClick={onToggleTheme}
        >
          <span className={`theme-ico${theme === "dark" ? " is-moon" : ""}`} />
          <small>DARK</small>
        </button>
      </div>
    </header>
  )
}

import { useLayoutEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import './product.css'

export type NavItem = { label: string; links: Array<{ label: string; href: string; ariaLabel: string }> }

export default function CardNav({ items, onAccount }: { items: NavItem[]; onAccount: () => void }) {
  const [open, setOpen] = useState(false)
  const navRef = useRef<HTMLElement>(null)
  const cardsRef = useRef<HTMLDivElement[]>([])
  const timeline = useRef<gsap.core.Timeline | null>(null)

  useLayoutEffect(() => {
    const nav = navRef.current
    if (!nav) return
    gsap.set(nav, { height: 62, overflow: 'hidden' })
    gsap.set(cardsRef.current, { y: 20, opacity: 0 })
    timeline.current = gsap.timeline({ paused: true })
      .to(nav, { height: 272, duration: 0.38, ease: 'power3.out' })
      .to(cardsRef.current, { y: 0, opacity: 1, duration: 0.3, stagger: 0.06, ease: 'power3.out' }, '-=0.14')
    return () => {
      timeline.current?.kill()
    }
  }, [])

  const toggle = () => {
    if (!timeline.current) return
    setOpen((value) => {
      value ? timeline.current?.reverse() : timeline.current?.play(0)
      return !value
    })
  }

  return <div className="card-nav-container">
    <nav ref={navRef} className={`card-nav ${open ? 'open' : ''}`} aria-label="主导航">
      <div className="card-nav-top">
        <button className={`hamburger-menu ${open ? 'open' : ''}`} onClick={toggle} aria-label={open ? '关闭菜单' : '打开菜单'} aria-expanded={open}>
          <span /><span />
        </button>
        <a className="card-nav-logo" href="/" aria-label="Sen Template 首页">SEN<span>/</span>3D</a>
        <button className="card-nav-cta-button" onClick={onAccount}>账户与授权</button>
      </div>
      <div className="card-nav-content" aria-hidden={!open}>
        {items.slice(0, 3).map((item, index) => <div key={item.label} className={`nav-card nav-card-${index}`} ref={(el) => { if (el) cardsRef.current[index] = el }}>
          <p className="nav-card-label">{item.label}</p>
          <div className="nav-card-links">{item.links.map((link) => <a key={link.label} href={link.href} aria-label={link.ariaLabel}><span>↗</span>{link.label}</a>)}</div>
        </div>)}
      </div>
    </nav>
  </div>
}

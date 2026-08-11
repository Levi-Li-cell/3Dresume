import { FormEvent, useEffect, useState } from 'react'
import CardNav, { type NavItem } from './CardNav'
import { useAuth } from './auth'
import './product.css'

const navItems: NavItem[] = [
  { label: '开始制作', links: [{ label: '进入 3D 工作台', href: '/studio', ariaLabel: '进入 3D 工作台' }, { label: '模型上手流程', href: '#model-guide', ariaLabel: '查看模型流程' }] },
  { label: '编辑能力', links: [{ label: '关键帧运镜', href: '#tools', ariaLabel: '查看运镜编辑器' }, { label: '贴纸与内容', href: '#tools', ariaLabel: '查看编辑功能' }] },
  { label: '方案与账户', links: [{ label: '3 元解锁', href: '/account', ariaLabel: '前往解锁页面' }, { label: '登录与订单', href: '/account', ariaLabel: '前往账户页面' }] },
]

export function ProductPage() {
  return <div className="product-page">
    <CardNav items={navItems} onAccount={() => { window.location.href = '/account' }} />
    <main>
      <section className="product-hero">
        <div className="hero-copy"><p className="product-kicker">PERSONAL 3D PORTFOLIO KIT</p><h1>把你的履历，<br />做成可进入的空间。</h1><p>不需要先成为三维工程师。导入 GLB、编辑内容、安排镜头，然后把专属作品集交给世界。</p><div className="product-actions"><a href="/account" className="primary-action">3 元解锁工作台</a><a href="/studio" className="quiet-action">先看演示 ↗</a></div></div>
        <div className="product-scene" aria-hidden="true"><div className="scene-word">SEN<br />3D</div><i className="orbit o-one" /><i className="orbit o-two" /><span className="scene-chip">GLB / CAMERA / STORY</span></div>
      </section>
      <section className="product-proof" id="tools"><p>ONE TEMPLATE, YOUR LANGUAGE</p><div><article><b>01</b><h2>把镜头变成叙事</h2><p>在时间线上安排关键帧，直接控制镜头偏移、焦点、景深与虚化强度。</p></article><article><b>02</b><h2>每一层都能编辑</h2><p>贴纸、人物资料、履历节点与作品内容，都能在同一处可视化调整。</p></article><article><b>03</b><h2>模型不必一样</h2><p>导入自己的 GLB 后，使用模型适配器更新当前模型、聚焦锚点和展示画面。</p></article></div></section>
      <section className="model-guide" id="model-guide"><p className="product-kicker">FREE MODEL WORKFLOW</p><h2>从一个提示词，开始你的角色。</h2><div className="guide-grid"><article><span>01</span><h3>准备一张正面参考</h3><p>选择背景干净、光线均匀、面部清晰的正面照片。避免手遮挡和复杂饰品。</p></article><article><span>02</span><h3>获取提示词套件</h3><p>解锁后可获得中英文模型提示词、反向提示词，以及生成失败时的修正方案。</p></article><article><span>03</span><h3>导入并适配</h3><p>把文件放入模型文件夹，在工作台内选择它，再通过模型适配器校正主体、焦点与镜头。</p></article></div></section>
      <section className="product-price"><div><p className="product-kicker">ONE TIME ACCESS</p><h2>3 元，解锁完整制作能力。</h2><p>一次付款，获得贴纸编辑器、运镜编辑器、内容编辑器、模型生成提示词与导入流程。</p></div><a href="/account" className="primary-action">创建账户并解锁</a></section>
    </main>
    <footer className="product-footer">SEN / 3D RESUME TEMPLATE <a href="/studio">打开演示</a></footer>
  </div>
}

export function AccountPage() {
  const account = useAuth((state) => state.account)
  const hydrate = useAuth((state) => state.hydrate)
  const signIn = useAuth((state) => state.signIn)
  const unlockDemo = useAuth((state) => state.unlockDemo)
  const signOut = useAuth((state) => state.signOut)
  const [email, setEmail] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => hydrate(), [hydrate])
  const submit = (event: FormEvent) => { event.preventDefault(); if (!/^\S+@\S+\.\S+$/.test(email)) return setNotice('请输入有效的邮箱地址。'); signIn(email); setNotice('账户已创建。请继续解锁编辑权限。') }
  return <div className="account-page"><CardNav items={navItems} onAccount={() => undefined} /><main className="account-main"><section><p className="product-kicker">ACCOUNT / LICENSE</p><h1>{account ? '你的 3D 工作台' : '创建账户，开始制作。'}</h1>{!account ? <form onSubmit={submit}><label>邮箱<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="you@example.com" /></label><button className="primary-action" type="submit">注册或登录</button>{notice && <small>{notice}</small>}</form> : <div className="account-card"><p>{account.email}</p><b>{account.unlocked ? '已解锁完整编辑权限' : '尚未解锁编辑权限'}</b>{account.unlocked ? <><a className="primary-action" href="/studio">进入工作台</a><details className="prompt-kit"><summary>查看模型提示词与导入流程</summary><code>full body 3D character of a young creative professional, front view, neutral A-pose, clean quad topology, PBR materials, studio lighting, game-ready, single character, no text, GLB export</code><p>1. 上传正面参考图到免费的图生 3D 工具。2. 使用上方提示词并导出 GLB。3. 将文件放到 <code>public/models</code>。4. 打开工作台，在模型适配器中选择文件并校正焦点。</p></details><button className="text-action" onClick={signOut}>退出账户</button></> : <><p className="payment-note">付款功能待接入微信支付或支付宝。当前仅展示完整购买流程，不会发起真实扣款。</p><button className="primary-action" onClick={unlockDemo}>以演示状态解锁 ¥3</button><button className="text-action" onClick={signOut}>切换账户</button></>}</div>}</section><aside><span>¥</span><strong>3</strong><p>一次性解锁</p><ul><li>贴纸编辑器</li><li>关键帧运镜编辑器</li><li>内容与个人资料编辑器</li><li>免费模型提示词与流程</li></ul></aside></main></div>
}

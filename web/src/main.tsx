import { createRoot } from 'react-dom/client'
import App from './App'
import { AccountPage, ProductPage } from './product/ProductPages'
import './styles.css'

const pathname = window.location.pathname.replace(/\/$/, '') || '/'
const page = pathname === '/account' ? <AccountPage /> : pathname === '/studio' ? <App /> : <ProductPage />

createRoot(document.getElementById('root')!).render(page)

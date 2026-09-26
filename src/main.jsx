import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  // Путь относительный, а не '/sw.js'. Абсолютный работает только когда
  // приложение лежит в корне домена; при размещении в подкаталоге он даёт
  // 404, ошибка глотается catch-ом, и офлайн-режим молча не включается —
  // без единого признака, что что-то не так. Относительный путь заодно
  // задаёт воркеру правильную область видимости: его каталог.
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('sw.js', document.baseURI)).catch(() => {})
  })
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

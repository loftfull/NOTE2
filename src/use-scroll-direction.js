// Направление прокрутки — чтобы плавающая кнопка не закрывала то, что читают.
//
// Кнопка «+» висит в правом нижнем углу и при загрузке перекрывала ссылку
// «Все задачи». Любая фиксированная кнопка рано или поздно накроет что-то
// полезное: и она, и действия в заголовках разделов прижаты к правому краю.
// Поэтому она уходит, когда листают вниз, и возвращается, когда листают
// вверх или прокрутка останавливается.
//
// Замер идёт в requestAnimationFrame: обработчик scroll срабатывает чаще,
// чем кадр, и чтение scrollY в каждом вызове заставляет браузер
// пересчитывать раскладку.

import { useEffect, useState } from 'react'

const THRESHOLD = 8   // мелкое дрожание пальца не считается жестом
const REST_MS = 900   // сколько тишины считать остановкой

export function useScrollDirection() {
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    let last = window.scrollY
    let ticking = false
    let restTimer = null

    const measure = () => {
      ticking = false
      const y = window.scrollY
      const delta = y - last
      if (Math.abs(delta) < THRESHOLD) return
      last = y
      // У самого верха прятать нечего: там кнопка ничего не закрывает.
      setHidden(delta > 0 && y > 120)

      clearTimeout(restTimer)
      restTimer = setTimeout(() => setHidden(false), REST_MS)
    }

    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(measure)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      clearTimeout(restTimer)
    }
  }, [])

  return hidden
}

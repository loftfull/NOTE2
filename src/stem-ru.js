// Приведение русского слова к основе для поиска.
//
// Зачем: запрос «хлеб» не находил заметку «Рецепт хлеба». Поиск сравнивал
// словоформы буквально, и любое склонение или спряжение разрывало совпадение
// — в русском это не краевой случай, а норма. Для личной базы знаний, где
// человек ищет по памяти, а не по точной формулировке, это и есть разница
// между «поиск работает» и «поиск бесполезен».
//
// Реализован алгоритм Snowball для русского языка (M. Porter, Snowball
// project, http://snowballstem.org/algorithms/russian/stemmer.html).
// Он не словарный: обрезает окончания по правилам, поэтому иногда объединяет
// неродственные слова. Для поиска это верный компромисс — потерянное
// совпадение хуже лишнего, потому что лишнее человек отсеет глазами, а
// потерянного он не увидит.

const VOWELS = 'аеиоуыэюяё'

const PERFECTIVE_GERUND_1 = ['вшись', 'вши', 'в']            // только после а/я
const PERFECTIVE_GERUND_2 = ['ывшись', 'ившись', 'ывши', 'ивши', 'ыв', 'ив']
const ADJECTIVE = [
  'ыми', 'ими', 'его', 'ому', 'ему', 'ой', 'ый', 'ая', 'ое', 'ые', 'ых', 'ую', 'юю',
  'ий', 'ее', 'ия', 'ье', 'ем', 'им', 'ых', 'ых', 'ом', 'ых', 'ею', 'ой', 'ых', 'ую'
]
const PARTICIPLE_1 = ['ем', 'нн', 'вш', 'ющ', 'щ']           // только после а/я
const PARTICIPLE_2 = ['ивш', 'ывш', 'ующ']
const REFLEXIVE = ['ся', 'сь']
const VERB_1 = [                                             // только после а/я
  'ешь', 'нно', 'ете', 'йте', 'ла', 'на', 'ли', 'ем', 'ло', 'но', 'ет', 'ют',
  'ны', 'ть', 'ей', 'уй', 'ил', 'ыл', 'им', 'ым', 'ен', 'ит', 'ыт', 'ят', 'ит',
  'ут', 'ат', 'л', 'н'
]
const VERB_2 = [
  'ейте', 'уйте', 'ила', 'ыла', 'ена', 'ите', 'или', 'ыли', 'ило', 'ыло',
  'ено', 'ует', 'уют', 'ены', 'ить', 'ыть', 'ишь', 'ыва', 'ешь', 'ем', 'нн',
  'ей', 'уй', 'ил', 'ыл', 'им', 'ым', 'ен', 'ит', 'ыт', 'ят', 'ую', 'ит', 'ут',
  'ат', 'ла', 'на', 'ли', 'ем', 'ло', 'но', 'ет', 'ют', 'ны', 'ть'
]
const NOUN = [
  'иями', 'ями', 'ами', 'ией', 'иям', 'ием', 'иях', 'ов', 'ог', 'ье', 'ия',
  'ей', 'ой', 'ий', 'ям', 'ем', 'ам', 'ом', 'ах', 'ях', 'ию', 'ью', 'ия', 'ья',
  'а', 'е', 'и', 'й', 'о', 'у', 'ы', 'ь', 'ю', 'я'
]
const SUPERLATIVE = ['ейше', 'ейш']
const DERIVATIONAL = ['ость', 'ост']

/** Индексы RV, R1 и R2 по определению алгоритма. */
export function regions(word) {
  const isVowel = index => VOWELS.includes(word[index])
  let rv = word.length
  for (let i = 0; i < word.length; i += 1) {
    if (isVowel(i)) { rv = i + 1; break }
  }
  let r1 = word.length
  for (let i = 1; i < word.length; i += 1) {
    if (!isVowel(i) && isVowel(i - 1)) { r1 = i + 1; break }
  }
  let r2 = word.length
  for (let i = r1 + 1; i < word.length; i += 1) {
    if (!isVowel(i) && isVowel(i - 1)) { r2 = i + 1; break }
  }
  return { rv, r1, r2 }
}

/** Убирает первое подходящее окончание из списка, не заходя левее `from`. */
function strip(word, endings, from, requirePrecedingAYa = false) {
  // Список сортируется по длине: иначе короткое окончание съест часть
  // длинного, и «ившись» превратится в «ивши» вместо основы.
  for (const ending of [...endings].sort((a, b) => b.length - a.length)) {
    if (!word.endsWith(ending)) continue
    const cut = word.length - ending.length
    if (cut < from) continue
    if (requirePrecedingAYa) {
      const previous = word[cut - 1]
      if (previous !== 'а' && previous !== 'я') continue
    }
    return word.slice(0, cut)
  }
  return null
}

/**
 * Основа слова. Слова короче четырёх букв и нерусские возвращаются как есть.
 *
 * Применять только к исходным словам, не к результату: алгоритм не
 * идемпотентен и не обязан быть. «читал» → «чита», а «чита» → «чит».
 * Для поиска это неважно, пока и запрос, и текст стеммятся по одному разу из
 * исходных слов, — но повторный прогон по уже сохранённым основам сдвинул бы
 * индекс.
 */
export function stemRu(input = '') {
  const word = String(input).toLowerCase().replace(/ё/g, 'е')
  if (word.length < 4 || !/^[а-я-]+$/.test(word)) return word

  const { rv, r2 } = regions(word)
  let stem = word

  // Шаг 1.
  const gerund = strip(stem, PERFECTIVE_GERUND_1, rv, true) ?? strip(stem, PERFECTIVE_GERUND_2, rv)
  if (gerund !== null) {
    stem = gerund
  } else {
    stem = strip(stem, REFLEXIVE, rv) ?? stem
    const adjectival =
      (() => {
        const adjective = strip(stem, ADJECTIVE, rv)
        if (adjective === null) return null
        // Причастие снимается только вместе с прилагательным окончанием.
        return strip(adjective, PARTICIPLE_1, rv, true) ?? strip(adjective, PARTICIPLE_2, rv) ?? adjective
      })()
    if (adjectival !== null) {
      stem = adjectival
    } else {
      const verb = strip(stem, VERB_1, rv, true) ?? strip(stem, VERB_2, rv)
      stem = verb ?? strip(stem, NOUN, rv) ?? stem
    }
  }

  // Шаг 2: «и» в RV.
  if (stem.endsWith('и') && stem.length - 1 >= rv) stem = stem.slice(0, -1)

  // Шаг 3: словообразовательный суффикс в R2.
  stem = strip(stem, DERIVATIONAL, r2) ?? stem

  // Шаг 4: «нн» → «н», превосходная степень, мягкий знак.
  if (stem.endsWith('нн')) {
    stem = stem.slice(0, -1)
  } else {
    const superlative = strip(stem, SUPERLATIVE, rv)
    if (superlative !== null) stem = superlative.endsWith('нн') ? superlative.slice(0, -1) : superlative
  }
  if (stem.endsWith('ь')) stem = stem.slice(0, -1)

  return stem
}

/** Основы для набора слов, без пустых. */
export function stemAll(words = []) {
  return words.map(word => stemRu(word)).filter(Boolean)
}

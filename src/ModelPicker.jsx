// Выбор модели из каталога провайдера.
//
// Раньше идентификатор вводился руками с подсказкой «точно как у
// провайдера»: чтобы подключить модель, надо было заранее знать её строку, а
// чтобы выбрать бесплатную — знать, какие вообще бесплатны. У OpenRouter в
// каталоге сотни моделей, и держать это в голове не должен никто.
//
// Список берётся у провайдера, а не из приложения: состав моделей меняется за
// недели. Любой вшитый в сборку перечень устареет и будет врать с уверенным
// видом, поэтому здесь нет ни одного зашитого идентификатора — только кнопка
// «Обновить» и дата последней загрузки.

import React, { useMemo, useState } from 'react'
import { Button, Chip, Input, Spinner } from './ui.jsx'
import { Icon } from './icons.jsx'
import { contextLabel, priceLabel, priceRank, rankCatalog } from './model-catalog.js'
import { freshnessLabel, isStale, loadCatalog, saveCatalog } from './catalog-cache.js'
import { fetchProviderCatalog } from './providers.js'

export function ModelPicker({ draft, setDraft, storedKey }) {
  const [record, setRecord] = useState(() => loadCatalog(draft.baseUrl))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [onlyFree, setOnlyFree] = useState(true)
  const [open, setOpen] = useState(false)

  const entries = record?.entries || []
  const shown = useMemo(() => rankCatalog(entries, { query, onlyFree }).slice(0, 60), [entries, query, onlyFree])
  const freeCount = useMemo(() => entries.filter(entry => priceRank(entry) <= 1).length, [entries])

  const refresh = async () => {
    setLoading(true); setError('')
    try {
      const fetched = await fetchProviderCatalog({ baseUrl: draft.baseUrl, apiKey: draft.apiKey })
      if (!fetched.length) throw new Error('Провайдер вернул пустой список моделей.')
      setRecord(saveCatalog(draft.baseUrl, fetched))
      setOpen(true)
    } catch (caught) {
      // Частая причина — не введён ключ: каталог у многих провайдеров
      // закрыт. Сказать прямо полезнее, чем показать код ошибки.
      const message = caught?.message || 'Не удалось загрузить список'
      setError(!draft.apiKey && !storedKey ? `${message} Возможно, нужен ключ провайдера.` : message)
    } finally {
      setLoading(false)
    }
  }

  const choose = entry => {
    setDraft({ ...draft, model: entry.id, label: draft.label || entry.name })
    setOpen(false)
  }

  return (
    <div className="modelPicker">
      <div className="row space modelPickerHead">
        <div className="modelPickerState">
          {record ? (
            <>
              <strong>{entries.length} моделей</strong>
              {freeCount ? <span className="tag tagFree">{freeCount} бесплатных</span> : null}
              <span className={`tiny ${isStale(record) ? 'modelPickerStale' : 'subtle'}`}>{freshnessLabel(record)}</span>
            </>
          ) : (
            <span className="small subtle">Список моделей не загружен</span>
          )}
        </div>
        <Button tone="tonal" icon="refresh" onClick={refresh} disabled={loading || !draft.baseUrl}>
          {loading ? 'Загрузка…' : record ? 'Обновить' : 'Загрузить'}
        </Button>
      </div>

      {error ? <p className="modelPickerError"><Icon name="error" size={15} /> {error}</p> : null}

      {record && !open ? (
        <button type="button" className="modelPickerOpen" onClick={() => setOpen(true)}>
          <Icon name="list" size={18} /> Выбрать из списка
        </button>
      ) : null}

      {open ? (
        <div className="modelPickerList">
          <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Поиск по названию модели…" />
          <div className="row gap8 modelPickerFilters">
            <Chip active={onlyFree} onClick={() => setOnlyFree(true)}>Бесплатные</Chip>
            <Chip active={!onlyFree} onClick={() => setOnlyFree(false)}>Все</Chip>
          </div>

          {loading ? <div className="row gap8 small subtle"><Spinner size={15} /> Загружаю каталог…</div> : null}

          {!shown.length ? (
            <p className="small subtle modelPickerEmpty">
              {onlyFree
                ? 'Бесплатных моделей в этом списке нет. Снимите фильтр, чтобы увидеть остальные.'
                : 'Ничего не нашлось по запросу.'}
            </p>
          ) : (
            <div className="modelPickerRows">
              {shown.map(entry => (
                <button
                  type="button"
                  key={entry.id}
                  className={`modelPickerRow ${draft.model === entry.id ? 'active' : ''}`}
                  onClick={() => choose(entry)}
                >
                  <span className="modelPickerName">{entry.name}</span>
                  <span className="modelPickerId">{entry.id}</span>
                  <span className="modelPickerMeta">
                    <span className={`tag ${priceRank(entry) === 0 ? 'tagFree' : ''}`}>{priceLabel(entry)}</span>
                    {contextLabel(entry) ? <span className="tiny subtle">{contextLabel(entry)}</span> : null}
                    {entry.vision ? <span className="tiny subtle">видит изображения</span> : null}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}

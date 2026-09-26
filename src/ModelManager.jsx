// The model manager screen: add, test, edit and remove AI models from inside
// the app. Its own file rather than another few hundred lines of App.jsx.
//
// The connection test is a real request to the provider's /models endpoint. It
// reports what actually came back — including whether the model id the user
// typed is among the ids the endpoint advertises — instead of showing a green
// tick because nothing threw.

import React, { useEffect, useState } from 'react'
import { Icon } from './icons.jsx'
import { ModelPicker } from './ModelPicker.jsx'
import { Button, Card, Chip, Field, Input, Select, Sheet, Spinner, Status } from './ui.jsx'
import { PROVIDERS, listProviderModels, providerInfo } from './providers.js'
import {
  MODEL_ROLES, createModelRecord, describeModel, draftModelFor,
  removeModel as removeFromList, upsertModel, validateModel
} from './models.js'
import { getCredential, removeCredential, setCredential } from './secure-credentials.js'

const ROLE_LABELS = [
  [MODEL_ROLES.chat, 'Диалог и анализ', 'forum'],
  [MODEL_ROLES.embed, 'Векторный поиск', 'search'],
  [MODEL_ROLES.vision, 'Изображения и OCR', 'image']
]

// Ordered so the two keyless local options come first: they are the only ones
// a user can try without going and getting a key somewhere else.
const PROVIDER_ORDER = ['ollama', 'lmstudio', 'openrouter', 'groq', 'google', 'mistral', 'openai', 'gateway', 'custom']

function ProviderBadge({ provider }) {
  const info = providerInfo(provider)
  if (info.local) return <Status tone="ok">локально · без ключа</Status>
  if (info.gateway) return <Status tone="neutral">свой сервер</Status>
  if (info.free) return <Status tone="warn">есть бесплатный тариф</Status>
  return <Status tone="neutral">платный</Status>
}

function ModelForm({ draft, setDraft, errors, storedKey }) {
  const info = providerInfo(draft.provider)
  return (
    <div className="modelForm">
      <div className="providerGrid">
        {PROVIDER_ORDER.map(id => (
          <button
            key={id}
            type="button"
            className={`providerTile ${draft.provider === id ? 'active' : ''}`}
            onClick={() => setDraft({ ...draft, provider: id, baseUrl: PROVIDERS[id].baseUrl || '' })}
          >
            <span className="providerName">{PROVIDERS[id].label}</span>
            <ProviderBadge provider={id} />
          </button>
        ))}
      </div>

      {info.hint ? <p className="modelHint"><Icon name="info" size={15} /> {info.hint}</p> : null}

      {/* Выбор из каталога провайдера стоит перед полем ввода: угадывать
          идентификатор руками нужно только если модели нет в списке. */}
      <ModelPicker draft={draft} setDraft={setDraft} storedKey={storedKey} />

      <Field label="Идентификатор модели" error={errors.model} hint="Заполняется выбором из списка. Можно вписать руками, если нужной модели там нет.">
        <Input value={draft.model} onChange={e => setDraft({ ...draft, model: e.target.value })} placeholder="выберите из списка выше" />
      </Field>

      <Field label="Название" hint="Как показывать в списке. Можно оставить пустым.">
        <Input value={draft.label} onChange={e => setDraft({ ...draft, label: e.target.value })} placeholder={draft.model || 'Моя модель'} />
      </Field>

      <Field label="Адрес сервера" error={errors.baseUrl}>
        <Input value={draft.baseUrl} onChange={e => setDraft({ ...draft, baseUrl: e.target.value })} placeholder="https://api.groq.com/openai/v1" />
      </Field>

      {!info.keyless && !info.gateway ? (
        <Field
          label="API-ключ"
          error={errors.apiKey}
          hint={storedKey ? 'Ключ уже сохранён. Оставьте пустым, чтобы не менять.' : 'Хранится в Android Keystore, в браузере — только на время сессии.'}
        >
          <Input
            type="password"
            value={draft.apiKey}
            onChange={e => setDraft({ ...draft, apiKey: e.target.value })}
            placeholder={storedKey ? '•••••••• сохранён' : 'вставьте ключ'}
          />
        </Field>
      ) : null}

      <div className="field">
        <span className="fieldLabel">Для чего использовать</span>
        <div className="chips">
          {ROLE_LABELS.map(([role, label, icon]) => (
            <Chip
              key={role}
              icon={icon}
              active={draft.roles.includes(role)}
              onClick={() => setDraft({
                ...draft,
                roles: draft.roles.includes(role) ? draft.roles.filter(r => r !== role) : [...draft.roles, role]
              })}
            >{label}</Chip>
          ))}
        </div>
        {errors.roles ? <span className="fieldError">{errors.roles}</span> : null}
      </div>

      {info.docs ? (
        <a className="modelDocs" href={info.docs} target="_blank" rel="noreferrer noopener">
          Где взять ключ <Icon name="chevron_right" size={16} />
        </a>
      ) : null}
    </div>
  )
}

export default function ModelManager({ models = [], activeModelId = '', onChange, setToast }) {
  const [editing, setEditing] = useState(null)      // the model id being edited, or 'new'
  const [draft, setDraft] = useState(draftModelFor('ollama'))
  const [errors, setErrors] = useState({})
  const [storedKey, setStoredKey] = useState(false)
  const [testing, setTesting] = useState('')
  const [results, setResults] = useState({})        // id -> { ok, note, ids }

  useEffect(() => {
    if (editing && editing !== 'new') {
      const existing = models.find(m => m.id === editing)
      if (existing) {
        setDraft({ ...existing, apiKey: '' })
        if (existing.apiKeyRef) getCredential(existing.apiKeyRef).then(v => setStoredKey(Boolean(v))).catch(() => setStoredKey(false))
        else setStoredKey(false)
      }
    }
  }, [editing, models])

  const openNew = () => { setDraft(draftModelFor('ollama')); setErrors({}); setStoredKey(false); setEditing('new') }
  const close = () => { setEditing(null); setErrors({}) }

  const save = async () => {
    const check = validateModel({ ...draft, hasStoredKey: storedKey })
    if (!check.valid) { setErrors(check.errors); return }
    try {
      const { record, secret } = createModelRecord({ ...draft, id: editing === 'new' ? undefined : editing, hasStoredKey: storedKey })
      // Only write the secret when one was typed, so editing a model without
      // retyping the key does not wipe the stored one.
      if (record.apiKeyRef && secret) await setCredential(record.apiKeyRef, secret)
      onChange({ models: upsertModel(models, record), activeModelId: activeModelId || record.id })
      setToast?.(editing === 'new' ? 'Модель добавлена' : 'Модель обновлена')
      close()
    } catch (error) {
      setToast?.(error.message)
    }
  }

  const drop = async model => {
    if (!confirm(`Удалить «${model.label}»?`)) return
    if (model.apiKeyRef) await removeCredential(model.apiKeyRef).catch(() => {})
    const next = removeFromList(models, model.id)
    onChange({ models: next, activeModelId: activeModelId === model.id ? (next[0]?.id || '') : activeModelId })
    setToast?.('Модель удалена')
  }

  // Real request. Reports what the endpoint returned, and says plainly when the
  // connection works but the typed model id is not in the advertised list.
  const testModel = async model => {
    setTesting(model.id)
    setResults(r => ({ ...r, [model.id]: null }))
    try {
      const apiKey = model.apiKeyRef ? await getCredential(model.apiKeyRef).catch(() => '') : ''
      const ids = await listProviderModels({ ...model, apiKey })
      const known = ids.includes(model.model)
      setResults(r => ({
        ...r,
        [model.id]: {
          ok: known,
          note: known
            ? `Подключение работает, модель доступна (${ids.length} моделей на сервере).`
            : ids.length
              ? `Сервер отвечает, но «${model.model}» нет в списке из ${ids.length} моделей.`
              : 'Сервер отвечает, но список моделей пуст.',
          ids: ids.slice(0, 8)
        }
      }))
    } catch (error) {
      setResults(r => ({ ...r, [model.id]: { ok: false, note: error.message, ids: [] } }))
    } finally {
      setTesting('')
    }
  }

  return (
    <div className="modelManager">
      <div className="sectionHeader">
        <div>
          <h3>Модели AI</h3>
          <p className="small subtle">Подключаются прямо здесь. Ключи не покидают устройство.</p>
        </div>
        <Button icon="add" onClick={openNew}>Добавить</Button>
      </div>

      {!models.length ? (
        <div className="empty modelEmpty">
          <div className="metricIcon"><Icon name="graphic_eq" size={22} /></div>
          <strong>Пока ни одной модели</strong>
          <span>Без модели AI-функции выключены — приложение не станет подменять ответ локальной эвристикой.</span>
          <Button icon="add" onClick={openNew}>Подключить первую</Button>
          <p className="tiny subtle" style={{ marginTop: 6 }}>Ollama работает локально и не требует ключа.</p>
        </div>
      ) : (
        <div className="modelList">
          {models.map(model => {
            const result = results[model.id]
            const active = model.id === activeModelId
            return (
              <Card key={model.id} className={`modelCard ${active ? 'active' : ''}`}>
                <div className="modelCardTop">
                  <button
                    className={`modelPick ${active ? 'on' : ''}`}
                    onClick={() => onChange({ models, activeModelId: model.id })}
                    aria-label={active ? 'Основная модель' : 'Сделать основной'}
                    title={active ? 'Основная модель' : 'Сделать основной'}
                  >
                    <Icon name={active ? 'check' : 'radio_button_unchecked'} size={19} />
                  </button>
                  <div className="modelCardMain">
                    <strong>{model.label}</strong>
                    <span className="tiny subtle">{describeModel(model)}</span>
                  </div>
                  <ProviderBadge provider={model.provider} />
                </div>

                <div className="modelMeta">
                  <code>{model.model}</code>
                  <div className="chips">
                    {model.roles.map(role => {
                      const found = ROLE_LABELS.find(r => r[0] === role)
                      return <span key={role} className="tag">{found ? found[1] : role}</span>
                    })}
                  </div>
                </div>

                {result ? (
                  <div className={`modelResult ${result.ok ? 'ok' : 'bad'}`}>
                    <Icon name={result.ok ? 'check' : 'warning'} size={16} />
                    <div>
                      <span>{result.note}</span>
                      {result.ids.length ? <p className="tiny subtle modelIds">{result.ids.join(' · ')}</p> : null}
                    </div>
                  </div>
                ) : null}

                <div className="modelActions">
                  <Button tone="tonal" icon="health_and_safety" disabled={testing === model.id} onClick={() => testModel(model)}>
                    {testing === model.id ? <><Spinner size={15} /> Проверка…</> : 'Проверить'}
                  </Button>
                  <Button tone="tonal" icon="edit_note" onClick={() => setEditing(model.id)}>Изменить</Button>
                  <Button tone="danger" icon="delete" onClick={() => drop(model)}>Удалить</Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Sheet
        open={Boolean(editing)}
        onClose={close}
        title={editing === 'new' ? 'Новая модель' : 'Изменить модель'}
        footer={<><Button tone="tonal" onClick={close}>Отмена</Button><Button icon="save" onClick={save}>Сохранить</Button></>}
      >
        <ModelForm draft={draft} setDraft={setDraft} errors={errors} storedKey={storedKey} />
      </Sheet>
    </div>
  )
}

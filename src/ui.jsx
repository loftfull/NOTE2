// Shared UI primitives.
//
// These lived inside App.jsx, which meant any new screen either imported from a
// 150 KB module or redeclared its own copy. Pulling them out is the first step
// of splitting that component up: a screen can now be written in its own file
// without dragging the whole app in with it.

import React from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './icons.jsx'

export function Button({ children, icon, tone = 'primary', onClick, disabled = false, className = '', type = 'button', title }) {
  return (
    <button type={type} title={title} className={`btn ${tone} ${className}`} onClick={onClick} disabled={disabled}>
      {icon && <Icon name={icon} size={18} />} {children}
    </button>
  )
}

export function Card({ children, className = '', ...rest }) {
  return <section className={`card ${className}`} {...rest}>{children}</section>
}

/**
 * A card whose body is collapsed until asked for, with a one-line summary of
 * its state while closed.
 *
 * The Profile screen was 4.4 screens of scrolling, two thirds of it server
 * configuration: six endpoint fields, account sync, the legacy sync mode and
 * storage. None of it is wrong to have, and deleting it would remove working
 * features — but a personal notebook should not open on a wall of URL fields.
 * Collapsed with a status line, each block says whether it needs attention
 * without costing a screen.
 *
 * Uses <details>/<summary> so it is keyboard-operable and open-by-find works
 * in browsers that support it, rather than a div with a click handler.
 */
export function Disclosure({ title, summary, tone = 'neutral', defaultOpen = false, children }) {
  return (
    <details className="disclosure card" open={defaultOpen}>
      <summary className="disclosureHead">
        <div className="disclosureText">
          <h3>{title}</h3>
          {summary ? <p className={`small ${tone === 'neutral' ? 'subtle' : `disclosureTone ${tone}`}`}>{summary}</p> : null}
        </div>
        <span className="disclosureChevron" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20"><path d="M8 10l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </span>
      </summary>
      <div className="disclosureBody">{children}</div>
    </details>
  )
}

export function Input(props) {
  return <input {...props} className={`input ${props.className || ''}`} />
}

export function Textarea(props) {
  return <textarea {...props} className={`textarea ${props.className || ''}`} />
}

export function Select(props) {
  return <select {...props} className={`select ${props.className || ''}`} />
}

/** Label + control + optional error, so forms report problems in one place. */
export function Field({ label, hint, error, children }) {
  return (
    <label className={`field ${error ? 'hasError' : ''}`}>
      <span className="fieldLabel">{label}</span>
      {children}
      {error ? <span className="fieldError">{error}</span> : hint ? <span className="fieldHint">{hint}</span> : null}
    </label>
  )
}

export function Chip({ children, icon, active = false, onClick, title }) {
  return (
    <button type="button" title={title} className={`chip ${active ? 'active' : ''}`} onClick={onClick}>
      {icon && <Icon name={icon} size={15} />} {children}
    </button>
  )
}

export function Spinner({ size = 18 }) {
  return <span className="spinner" style={{ width: size, height: size }} aria-hidden="true" />
}

/** Neutral / ok / warn / danger status pill used across screens. */
export function Status({ tone = 'neutral', children }) {
  return <span className={`statusPill ${tone}`}>{children}</span>
}

/**
 * Bottom sheet / dialog.
 *
 * Rendered through a portal on purpose. The sheet is position: fixed, but any
 * ancestor carrying backdrop-filter (which every glass card here does) becomes
 * a containing block for fixed descendants — so a sheet nested inside a card
 * anchors to that card instead of the viewport and effectively disappears.
 * Going straight to document.body is the only reliable fix.
 */
export function Sheet({ open, onClose, title, children, footer }) {
  if (!open) return null
  if (typeof document === 'undefined') return null
  return createPortal(
    <>
      <div className="sheetBackdrop" onClick={onClose} />
      <div className="sheetPanel" role="dialog" aria-modal="true" aria-label={title}>
        <div className="captureGrab" />
        <div className="sheetHead">
          <h3>{title}</h3>
          <button className="iconBtn" onClick={onClose} aria-label="Закрыть"><Icon name="close" /></button>
        </div>
        <div className="sheetBody">{children}</div>
        {footer ? <div className="sheetFoot">{footer}</div> : null}
      </div>
    </>,
    document.body
  )
}

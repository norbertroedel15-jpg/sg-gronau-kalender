const TITLE = 'Terminkalender SG Gronau Abteilung Fußball'
/** Cache-Bust, falls Browser alte Assets hält */
const WAPPEN_SRC = `/wappen.png?v=20261107b`

export { TITLE }

export default function BrandMark({ variant = 'login' }) {
  return (
    <div className={`brand-mark brand-mark--${variant}`}>
      <div className="brand-crest-frame">
        <img
          className="brand-crest"
          src={WAPPEN_SRC}
          alt="Wappen SG Gronau"
          width={200}
          height={200}
          decoding="async"
        />
      </div>
      <div className="brand-copy">
        <h1 className="brand-title">{TITLE}</h1>
        {variant === 'login' ? (
          <p className="brand-sub">
            Gemeinsamer Terminplan für Vorstand, Trainer, Betreuer und Leitung.
          </p>
        ) : null}
      </div>
    </div>
  )
}

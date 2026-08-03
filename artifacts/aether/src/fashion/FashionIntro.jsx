export function FashionIntro() {
  return (
    <section className="fashion-intro" aria-label="Fashion Market">
      <p className="fashion-intro__eyebrow">MODA · NUEVA TEMPORADA</p>
      <div className="fashion-intro__title">
        <h1 aria-label="Fashion Market">
          {["FASHION", "MARKET"].map((word, wordIndex) => (
            <span key={word}>
              {[...word].map((letter, letterIndex) => (
                <i
                  key={`${word}-${letterIndex}`}
                  style={{ "--letter-delay": `${(wordIndex * 7 + letterIndex) * 55}ms` }}
                >
                  {letter}
                </i>
              ))}
            </span>
          ))}
        </h1>
        <p>By Marketplace</p>
      </div>
      <a className="fashion-intro__discover" href="#inicio">
        <span aria-hidden="true">↓</span>
        DESCUBRÍ
      </a>
    </section>
  );
}

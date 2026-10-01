export default function Loading() {
  return (
    <main id="main" className="loading-screen" aria-busy="true">
      <span className="eyebrow">CROSSEXAM</span>
      <h1>Opening the case file…</h1>
      <div className="skeleton" />
      <div className="skeleton short" />
    </main>
  );
}

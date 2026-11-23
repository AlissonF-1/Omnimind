export default function QuestionsLoading() {
  return (
    <div role="status" className="q-shell q-stack">
      <span className="sr-only">Carregando questões…</span>
      <div aria-hidden="true" className="q-panel q-skeleton h-52 motion-safe:animate-pulse" />
      <div aria-hidden="true" className="q-topic-grid">
        {[1, 2, 3].map((index) => <div key={index} className="q-panel q-skeleton motion-safe:animate-pulse" />)}
      </div>
    </div>
  )
}

import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_auth/operators')({
  component: OperatorsPage,
})

function OperatorsPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Operators</h1>
      <p className="text-tundra-ink-500">Operator management coming soon.</p>
    </div>
  )
}

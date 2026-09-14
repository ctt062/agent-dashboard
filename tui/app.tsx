import { Box, Text, useApp, useInput } from 'ink'
import { useEffect, useRef, useState } from 'react'
import type { LoadDashboard } from './cli.js'
import { formatDeck } from './status.js'

type Props = {
  load: LoadDashboard
}

export function App({ load }: Props) {
  const { exit } = useApp()
  const loadRef = useRef(load)
  loadRef.current = load
  const [frame, setFrame] = useState('Reading local agent status…')
  const [error, setError] = useState<string | null>(null)

  async function refresh(force = false) {
    try {
      const payload = await loadRef.current(force)
      setFrame(formatDeck(payload))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => {
    void refresh(false)
    const id = setInterval(() => void refresh(false), 15_000)
    return () => clearInterval(id)
  }, [])

  useInput((input, key) => {
    if (input === 'q' || key.escape) exit()
    if (input === 'r') void refresh(true)
  })

  return (
    <Box flexDirection="column">
      <Text>{error ? `Collector error: ${error}` : frame}</Text>
      <Text dimColor>q quit  r refresh</Text>
    </Box>
  )
}

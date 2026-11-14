interface StreamEvent {
  type: string
  data: string
  lastEventId: string
}

export async function readEventStream(
  body: ReadableStream<Uint8Array>,
  onEvent?: (event: StreamEvent) => void,
) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let eventType = ""
  let lastEventId = ""
  let data: string[] = []

  function readLine(line: string) {
    if (!line) {
      if (data.length) {
        onEvent?.({ type: eventType || "message", data: data.join("\n"), lastEventId })
      }
      eventType = ""
      data = []
      return
    }

    const separator = line.indexOf(":")
    const field = separator === -1 ? line : line.slice(0, separator)
    const value = separator === -1 ? "" : line.slice(separator + 1).replace(/^ /, "")

    switch (field) {
      case "event":
        eventType = value
        break
      case "data":
        data.push(value)
        break
      case "id":
        if (!value.includes("\0")) lastEventId = value
        break
    }
  }

  try {
    for (;;) {
      const { done, value } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })

      // Hold a trailing CR until the next chunk distinguishes CR from CRLF.
      const end = !done && buffer.endsWith("\r") ? buffer.length - 1 : buffer.length
      const lines = buffer.slice(0, end).split(/\r\n|\n|\r/)
      buffer = lines.pop() + buffer.slice(end)
      lines.forEach(readLine)

      if (done) break
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined)
    throw error
  } finally {
    reader.releaseLock()
  }
}

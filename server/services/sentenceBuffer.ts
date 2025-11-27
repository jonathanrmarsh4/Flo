/**
 * Sentence Buffer Utility
 * Accumulates streaming text chunks and yields complete sentences for TTS
 */

export class SentenceBuffer {
  private buffer: string = '';
  private sentenceEndPattern = /[.!?]+[\s"')\]]*$/;
  private minChunkLength = 20; // Minimum chars before checking for sentence end

  /**
   * Add a chunk of text and return any complete sentences
   */
  addChunk(chunk: string): string | null {
    this.buffer += chunk;
    
    // Don't check for sentences until we have enough text
    if (this.buffer.length < this.minChunkLength) {
      return null;
    }

    // Look for sentence-ending punctuation
    const match = this.buffer.match(this.sentenceEndPattern);
    
    if (match) {
      // Find the position of the sentence end
      const endIndex = this.buffer.lastIndexOf(match[0]) + match[0].length;
      const sentence = this.buffer.substring(0, endIndex).trim();
      this.buffer = this.buffer.substring(endIndex).trim();
      
      if (sentence.length > 0) {
        return sentence;
      }
    }

    return null;
  }

  /**
   * Flush any remaining text in the buffer
   */
  flush(): string | null {
    const remaining = this.buffer.trim();
    this.buffer = '';
    return remaining.length > 0 ? remaining : null;
  }

  /**
   * Reset the buffer
   */
  reset(): void {
    this.buffer = '';
  }
}

/**
 * Process a stream of text chunks and yield complete sentences
 */
export async function* streamToSentences(
  textStream: AsyncIterable<string>
): AsyncGenerator<string> {
  const buffer = new SentenceBuffer();

  for await (const chunk of textStream) {
    const sentence = buffer.addChunk(chunk);
    if (sentence) {
      yield sentence;
    }
  }

  // Flush any remaining text
  const remaining = buffer.flush();
  if (remaining) {
    yield remaining;
  }
}

import { ref, onUnmounted } from 'vue'

// 浏览器原生语音识别类型（非标准 TS 类型，做最小声明）
interface SpeechRecognitionAlternative {
  transcript: string
  confidence: number
}
interface SpeechRecognitionResultItem {
  isFinal: boolean
  length: number
  [index: number]: SpeechRecognitionAlternative
}
interface SpeechRecognitionResultList {
  length: number
  [index: number]: SpeechRecognitionResultItem
}
interface SpeechRecognitionEventLike {
  resultIndex: number
  results: SpeechRecognitionResultList
}
interface SpeechRecognitionLike {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((e: SpeechRecognitionEventLike) => void) | null
  onerror: ((e: any) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null
  const w = window as any
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

export function useSpeech() {
  const isListening = ref(false)
  const isSpeaking = ref(false)
  const transcript = ref('')
  const supported = ref(!!getRecognitionCtor() && 'speechSynthesis' in window)

  let recognition: SpeechRecognitionLike | null = null

  function startListening(onFinal?: (text: string) => void): boolean {
    const Ctor = getRecognitionCtor()
    if (!Ctor) {
      console.warn('当前浏览器不支持语音识别，请使用 Chrome/Edge')
      return false
    }
    if (isListening.value) return true

    recognition = new Ctor()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = 'zh-CN'

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let interim = ''
      let final = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const transcriptText = result[0]?.transcript || ''
        if (result.isFinal) {
          final += transcriptText
        } else {
          interim += transcriptText
        }
      }
      transcript.value = final || interim
      if (final && onFinal) {
        onFinal(final)
      }
    }

    recognition.onerror = (e: any) => {
      console.warn('语音识别出错:', e?.error || e)
      isListening.value = false
    }

    recognition.onend = () => {
      isListening.value = false
    }

    try {
      recognition.start()
      isListening.value = true
      transcript.value = ''
      return true
    } catch (e) {
      console.warn('启动语音识别失败:', e)
      isListening.value = false
      return false
    }
  }

  function stopListening() {
    if (recognition) {
      try { recognition.stop() } catch { /* ignore */ }
    }
    isListening.value = false
  }

  function speak(text: string) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      console.warn('当前浏览器不支持语音合成')
      return
    }
    if (!text || !text.trim()) return
    try {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'zh-CN'
      utterance.rate = 1.0
      utterance.onstart = () => { isSpeaking.value = true }
      utterance.onend = () => { isSpeaking.value = false }
      utterance.onerror = () => { isSpeaking.value = false }
      window.speechSynthesis.speak(utterance)
    } catch (e) {
      console.warn('语音合成失败:', e)
    }
  }

  function stopSpeaking() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try { window.speechSynthesis.cancel() } catch { /* ignore */ }
    }
    isSpeaking.value = false
  }

  onUnmounted(() => {
    stopListening()
    stopSpeaking()
  })

  return {
    isListening,
    isSpeaking,
    transcript,
    supported,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
  }
}

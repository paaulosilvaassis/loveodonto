import { useCallback, useRef, useState } from 'react';

const LANG = 'pt-BR';
const VOLUME_BG = 0.35;
const VOLUME_DUCK = 0.15;
const BG_DURATION_MIN_MS = 8000;
const BG_DURATION_MAX_MS = 12000;
const BG_STOP_AFTER_SPEECH_MS = 4000;

/** URL da trilha de fundo (servida de public/audio). Se 404, apenas TTS é usado. */
export const WELCOME_BG_AUDIO_URL = '/audio/welcome-bg.mp3';

const DIAS_SEMANA = [
  'domingo', 'segunda-feira', 'terça-feira', 'quarta-feira',
  'quinta-feira', 'sexta-feira', 'sábado',
];

const FRASES_MOTIVACIONAIS = [
  'Tenha um ótimo dia de trabalho!',
  'Cada atendimento faz a diferença.',
  'Você está no comando do seu dia.',
  'Bom trabalho e foco nos pacientes.',
  'Um passo de cada vez. Você consegue!',
];

const KEYWORD_ROUTES = {
  agenda: '/gestao/agenda',
  pacientes: '/pacientes/busca',
  financeiro: '/financeiro/contas-receber',
};

function getDiaSemana() {
  return DIAS_SEMANA[new Date().getDay()];
}

function getRandomMotivacional() {
  return FRASES_MOTIVACIONAIS[Math.floor(Math.random() * FRASES_MOTIVACIONAIS.length)];
}

export function buildWelcomeMessage(nomeUsuario, nomeClinica, qtdConsultasHoje) {
  const diaSemana = getDiaSemana();
  const nome = nomeUsuario && nomeUsuario.trim() ? nomeUsuario.trim().split(' ')[0] : 'Usuário';
  const clinica = nomeClinica && nomeClinica.trim() ? nomeClinica.trim() : 'Clínica';
  const consultas = Number.isFinite(qtdConsultasHoje) ? qtdConsultasHoje : 0;
  const consultasTexto = consultas === 1 ? '1 atendimento' : `${consultas} atendimentos`;
  return `Olá, ${nome}! Bem-vindo à ${clinica}. Hoje é ${diaSemana}. Você tem ${consultasTexto}.`;
}

/**
 * Verifica suporte a SpeechRecognition (navegador e prefixos).
 * @returns {boolean}
 */
export function isSpeechRecognitionSupported() {
  if (typeof window === 'undefined') return false;
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  return Boolean(SpeechRecognition);
}

/**
 * Verifica suporte a SpeechSynthesis.
 */
export function isSpeechSynthesisSupported() {
  return typeof window !== 'undefined' && Boolean(window.speechSynthesis);
}

/**
 * Hook do assistente de voz: TTS, trilha de fundo com ducking, reconhecimento de voz.
 * @param {{ nomeUsuario: string, nomeClinica: string, qtdConsultasHoje: number, onNavigate: (path: string) => void }} options
 */
export function useVoiceAssistant({ nomeUsuario, nomeClinica, qtdConsultasHoje, onNavigate }) {
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState(null);

  const bgAudioRef = useRef(null);
  const synthesisRef = useRef(null);
  const recognitionRef = useRef(null);

  /** Inicia trilha de fundo; após durationMs chama onReadyToSpeak (ducking e TTS ficam por conta do caller). */
  const playBackground = useCallback((url, volume, durationMsBeforeSpeak, onReadyToSpeak) => {
    if (!url) {
      onReadyToSpeak?.();
      return;
    }
    const audio = new Audio(url);
    audio.loop = true;
    bgAudioRef.current = audio;
    audio.volume = volume;
    audio.play().then(() => {
      setTimeout(() => onReadyToSpeak?.(), durationMsBeforeSpeak);
    }).catch(() => {
      bgAudioRef.current = null;
      onReadyToSpeak?.();
    });
  }, []);

  const setBackgroundVolume = useCallback((volume) => {
    const audio = bgAudioRef.current;
    if (audio) audio.volume = Math.max(0, Math.min(1, volume));
  }, []);

  const stopBackground = useCallback(() => {
    const audio = bgAudioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      bgAudioRef.current = null;
    }
  }, []);

  const speak = useCallback((text, { onStart, onEnd } = {}) => {
    if (!isSpeechSynthesisSupported()) {
      onEnd?.();
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = LANG;
    u.rate = 0.95;
    u.onstart = onStart;
    u.onend = () => {
      synthesisRef.current = null;
      onEnd?.();
    };
    u.onerror = () => {
      synthesisRef.current = null;
      onEnd?.();
    };
    synthesisRef.current = u;
    window.speechSynthesis.speak(u);
  }, []);

  const runWelcomeSequence = useCallback(() => {
    setError(null);
    setIsPlaying(true);

    const durationMs = BG_DURATION_MIN_MS + Math.random() * (BG_DURATION_MAX_MS - BG_DURATION_MIN_MS);

    const onReadyToSpeak = () => {
      const welcome = buildWelcomeMessage(nomeUsuario, nomeClinica, qtdConsultasHoje);
      const motivacional = getRandomMotivacional();
      const fullText = `${welcome} ${motivacional}`;

      speak(fullText, {
        onStart: () => setBackgroundVolume(VOLUME_DUCK),
        onEnd: () => {
          setBackgroundVolume(VOLUME_BG);
          setTimeout(() => {
            stopBackground();
            setIsPlaying(false);
          }, BG_STOP_AFTER_SPEECH_MS);
        },
      });
    };

    playBackground(WELCOME_BG_AUDIO_URL, VOLUME_BG, durationMs, onReadyToSpeak);
  }, [nomeUsuario, nomeClinica, qtdConsultasHoje, playBackground, setBackgroundVolume, speak, stopBackground]);

  const activateAssistant = useCallback(() => {
    setAudioUnlocked(true);
    setError(null);
    runWelcomeSequence();
  }, [runWelcomeSequence]);

  const startVoiceCommand = useCallback(() => {
    if (!isSpeechRecognitionSupported()) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = LANG;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognitionRef.current = recognition;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => {
      recognitionRef.current = null;
      setIsListening(false);
    };
    recognition.onerror = () => {
      recognitionRef.current = null;
      setIsListening(false);
    };
    recognition.onresult = (event) => {
      const transcript = (event.results[0]?.[0]?.transcript || '').toLowerCase().trim();
      for (const [keyword, path] of Object.entries(KEYWORD_ROUTES)) {
        if (transcript.includes(keyword)) {
          onNavigate?.(path);
          return;
        }
      }
    };
    recognition.start();
  }, [onNavigate]);

  const stopVoiceCommand = useCallback(() => {
    const rec = recognitionRef.current;
    if (rec) {
      rec.abort();
      recognitionRef.current = null;
      setIsListening(false);
    }
  }, []);

  return {
    audioUnlocked,
    isPlaying,
    isListening,
    error,
    activateAssistant,
    runWelcomeSequence,
    startVoiceCommand,
    stopVoiceCommand,
    speechRecognitionSupported: isSpeechRecognitionSupported(),
    speechSynthesisSupported: isSpeechSynthesisSupported(),
  };
}

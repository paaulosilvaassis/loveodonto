import { Mic, Volume2 } from 'lucide-react';

/**
 * Card do Assistente de Voz no Dashboard.
 * - Toggle "Boas-vindas por voz" (ON/OFF)
 * - Botão "Ativar assistente" (libera áudio no navegador)
 * - Botão "Ouvir comando" (SpeechRecognition) apenas se suportado
 */
export default function VoiceAssistantCard({
  voiceWelcomeEnabled,
  onVoiceWelcomeChange,
  audioUnlocked,
  isPlaying,
  isListening,
  speechRecognitionSupported,
  onActivateAssistant,
  onStartVoiceCommand,
  onStopVoiceCommand,
}) {
  return (
    <div className="voice-assistant-card">
      <div className="voice-assistant-card-header">
        <span className="voice-assistant-card-title">Assistente de voz</span>
        <label className="voice-assistant-toggle" aria-label="Boas-vindas por voz">
          <input
            type="checkbox"
            checked={voiceWelcomeEnabled}
            onChange={(e) => onVoiceWelcomeChange(e.target.checked)}
            aria-describedby="voice-welcome-desc"
          />
          <span className="voice-assistant-toggle-slider" />
          <span id="voice-welcome-desc" className="voice-assistant-toggle-label">
            Boas-vindas por voz
          </span>
        </label>
      </div>
      <div className="voice-assistant-card-actions">
        <button
          type="button"
          className="voice-assistant-btn voice-assistant-btn-primary"
          onClick={onActivateAssistant}
          disabled={isPlaying}
          aria-label="Ativar assistente de voz"
        >
          {isPlaying ? (
            <Volume2 size={18} className="voice-assistant-btn-icon" aria-hidden />
          ) : (
            <Volume2 size={18} className="voice-assistant-btn-icon" aria-hidden />
          )}
          {isPlaying ? 'Reproduzindo…' : 'Ativar assistente'}
        </button>
        {speechRecognitionSupported && (
          <button
            type="button"
            className={`voice-assistant-btn voice-assistant-btn-secondary ${isListening ? 'is-listening' : ''}`}
            onClick={isListening ? onStopVoiceCommand : onStartVoiceCommand}
            aria-label={isListening ? 'Parar escuta' : 'Ouvir comando de voz'}
          >
            <Mic size={18} className="voice-assistant-btn-icon" aria-hidden />
            {isListening ? 'Ouvindo…' : 'Ouvir comando'}
          </button>
        )}
      </div>
      {!audioUnlocked && !isPlaying && (
        <p className="voice-assistant-hint">
          Clique em &quot;Ativar assistente&quot; para liberar áudio no navegador e ouvir a mensagem de boas-vindas.
        </p>
      )}
    </div>
  );
}

from groq import Groq


# Whisper takes ISO-639-1. Left to auto-detect it flips between Hindi and
# Urdu for the same speaker (they're acoustically close), which is why
# transcripts came back in Urdu script. Hinglish is mostly Hindi speech, so
# it pins to "hi" and the roman-script rendering is handled in the prompt.
_LANGUAGE_TO_WHISPER_CODE = {
    "english": "en",
    "hindi": "hi",
    "hinglish": "hi",
    "marathi": "mr",
    "telugu": "te",
    "tamil": "ta",
    "bengali": "bn",
    "gujarati": "gu",
    "kannada": "kn",
    "punjabi": "pa",
    "malayalam": "ml",
    "urdu": "ur",
    "spanish": "es",
    "french": "fr",
    "german": "de",
}


def transcribe_audio(api_key: str, filename: str, audio_bytes: bytes, language: str | None = None) -> str:
    client = Groq(api_key=api_key)
    code = _LANGUAGE_TO_WHISPER_CODE.get((language or "").strip().lower())
    kwargs = {"language": code} if code else {}
    transcript = client.audio.transcriptions.create(
        model="whisper-large-v3",
        file=(filename, audio_bytes),
        **kwargs,
    )
    return transcript.text.strip()

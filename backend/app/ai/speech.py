import io

from gtts import gTTS

# gTTS speaks one language per call and has no real "Hinglish" (code-mixed)
# voice - 'hi' is the closest phonetic fit for romanized Hindi-English text.
# Anything not in this map falls back to English rather than failing.
_LANGUAGE_TO_GTTS_CODE = {
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
}


def synthesize_speech(text: str, language: str) -> bytes:
    lang_code = _LANGUAGE_TO_GTTS_CODE.get(language.strip().lower(), "en")
    buffer = io.BytesIO()
    gTTS(text=text, lang=lang_code).write_to_fp(buffer)
    return buffer.getvalue()

from groq import Groq


def transcribe_audio(api_key: str, filename: str, audio_bytes: bytes) -> str:
    client = Groq(api_key=api_key)
    transcript = client.audio.transcriptions.create(
        model="whisper-large-v3",
        file=(filename, audio_bytes),
    )
    return transcript.text.strip()

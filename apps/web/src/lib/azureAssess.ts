// Long read-aloud takes are scored in the browser with the Azure Speech SDK in continuous mode
// (REST only accepts 30 s). The Worker hands out a 10-minute token, so the key never reaches the
// page. Only Azure's raw per-utterance results are returned — the server merges them into scores.
import type { AzureSegment } from "@msyen/shared";
import { accountApi } from "./api";
import { t } from "../i18n";

export async function assessInBrowser(wav: Blob, referenceText: string, locale = "en-US"): Promise<AzureSegment[]> {
  const sdk = await import("microsoft-cognitiveservices-speech-sdk");
  const { token, region } = await accountApi.speechToken();

  const speechConfig = sdk.SpeechConfig.fromAuthorizationToken(token, region);
  speechConfig.speechRecognitionLanguage = locale;
  const audioConfig = sdk.AudioConfig.fromWavFileInput(new File([wav], "take.wav", { type: "audio/wav" }));
  const pa = new sdk.PronunciationAssessmentConfig(
    referenceText,
    sdk.PronunciationAssessmentGradingSystem.HundredMark,
    sdk.PronunciationAssessmentGranularity.Phoneme,
    false, // miscue is not available in continuous mode; the server aligns words to the passage
  );
  pa.phonemeAlphabet = "IPA";
  pa.enableProsodyAssessment = true;

  const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
  pa.applyTo(recognizer);

  const segments: AzureSegment[] = [];
  try {
    await new Promise<void>((resolve, reject) => {
      recognizer.recognized = (_s, e) => {
        if (e.result.reason !== sdk.ResultReason.RecognizedSpeech) return;
        const raw = e.result.properties.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult);
        if (raw) {
          try {
            segments.push(JSON.parse(raw) as AzureSegment);
          } catch {
            /* skip a malformed segment */
          }
        }
      };
      recognizer.canceled = (_s, e) => {
        if (e.reason === sdk.CancellationReason.Error) reject(new Error(e.errorDetails || t("lib.azureAssess.error.failed")));
        else resolve(); // end of the file
      };
      recognizer.sessionStopped = () => resolve();
      recognizer.startContinuousRecognitionAsync(undefined, (err) => reject(new Error(err)));
    });
  } finally {
    await new Promise<void>((r) => recognizer.stopContinuousRecognitionAsync(() => r(), () => r()));
    recognizer.close();
  }
  return segments;
}

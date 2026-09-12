/**
 * Recording one spoken answer.
 *
 * A thin wrapper over MediaRecorder, and thin on purpose: the interesting decisions are
 * about failure, not about audio. Microphone permission can be refused, the device can have
 * no microphone, the browser can lack the API, and a tab can be suspended mid-recording.
 * Every one of those has to arrive as a sentence the screen can show next to a text box,
 * because the answer to "the microphone did not work" is always "then type it".
 *
 * The stream is stopped explicitly after every recording. A tab that keeps the microphone
 * open shows a recording indicator forever, and people rightly find that alarming.
 */

export type RecordingError =
  | 'unsupported'
  | 'denied'
  | 'no-microphone'
  | 'nothing-recorded'
  | 'failed';

export const RECORDING_MESSAGE: Record<RecordingError, string> = {
  unsupported: 'This browser cannot record audio. Type your answer instead.',
  denied: 'The microphone is blocked. Allow it in your browser, or type your answer instead.',
  'no-microphone': 'No microphone was found. Type your answer instead.',
  'nothing-recorded': 'Nothing was recorded. Try again, or type your answer instead.',
  failed: 'The recording did not work. Type your answer instead.',
};

export type Recording = { blob: Blob; mimeType: string; seconds: number };

export type Recorder = {
  /** Resolves when the recording is finished and the microphone has been released. */
  stop: () => Promise<Recording>;
  /** Abandon it: no result, and the microphone is released. */
  cancel: () => void;
};

export class RecordingFailure extends Error {
  constructor(readonly kind: RecordingError) {
    super(RECORDING_MESSAGE[kind]);
    this.name = 'RecordingFailure';
  }
}

export const canRecord = (): boolean =>
  typeof window !== 'undefined' &&
  typeof MediaRecorder !== 'undefined' &&
  typeof navigator !== 'undefined' &&
  Boolean(navigator.mediaDevices?.getUserMedia);

/** Whatever this browser will actually give us; Safari and Chrome disagree. */
const pickMimeType = (): string => {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported?.(type)) return type;
  }
  return '';
};

export const startRecording = async (): Promise<Recorder> => {
  if (!canRecord()) throw new RecordingFailure('unsupported');

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') throw new RecordingFailure('denied');
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      throw new RecordingFailure('no-microphone');
    }
    throw new RecordingFailure('failed');
  }

  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];
  const startedAt = Date.now();

  recorder.addEventListener('dataavailable', (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  });
  recorder.start();

  const release = (): void => {
    for (const track of stream.getTracks()) track.stop();
  };

  return {
    stop: () =>
      new Promise<Recording>((resolve, reject) => {
        recorder.addEventListener(
          'stop',
          () => {
            release();
            const type = recorder.mimeType || mimeType || 'audio/webm';
            const blob = new Blob(chunks, { type });
            if (blob.size === 0) {
              reject(new RecordingFailure('nothing-recorded'));
              return;
            }
            resolve({ blob, mimeType: type, seconds: (Date.now() - startedAt) / 1000 });
          },
          { once: true },
        );
        recorder.addEventListener('error', () => {
          release();
          reject(new RecordingFailure('failed'));
        }, { once: true });
        if (recorder.state !== 'inactive') recorder.stop();
      }),
    cancel: () => {
      if (recorder.state !== 'inactive') recorder.stop();
      release();
    },
  };
};

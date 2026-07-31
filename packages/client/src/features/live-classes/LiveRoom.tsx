import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RtcCredentialsView } from '@madrasty/shared';
import { Icon } from '../../components/Icon';

// The actual video surface. Everything Agora-specific is confined to this file
// and loaded with a DYNAMIC import, so the ~700kB SDK never lands in the main
// bundle for the 95% of screens that have nothing to do with live video.
//
// The credentials come from the server's join response — this component never
// knows an app certificate, never picks a channel, and never chooses its own
// role. It renders what it was handed.
type Role = 'host' | 'audience';

// Minimal structural types for the bits of the SDK we touch, so the rest of the
// file stays type-checked without importing the SDK's types eagerly.
interface RemoteUser {
  uid: string | number;
  videoTrack?: { play: (el: HTMLElement) => void };
  audioTrack?: { play: () => void };
}

interface RtcClient {
  setClientRole: (role: 'host' | 'audience') => Promise<void>;
  join: (appId: string, channel: string, token: string, uid: number) => Promise<unknown>;
  publish: (tracks: unknown[]) => Promise<void>;
  leave: () => Promise<void>;
  subscribe: (user: RemoteUser, mediaType: 'audio' | 'video') => Promise<void>;
  on: (event: string, handler: (...args: never[]) => void) => void;
  removeAllListeners: () => void;
}

interface LocalTrack {
  play: (el: HTMLElement) => void;
  stop: () => void;
  close: () => void;
  setEnabled: (enabled: boolean) => Promise<void>;
}

export function LiveRoom({
  credentials,
  role,
  onError,
}: {
  credentials: RtcCredentialsView;
  role: Role;
  onError?: (message: string) => void;
}) {
  const { t } = useTranslation();
  const localRef = useRef<HTMLDivElement>(null);
  const remoteRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'failed'>('connecting');
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const tracksRef = useRef<{ mic?: LocalTrack; cam?: LocalTrack }>({});

  // The dev/test provider issues stub credentials that no real SDK can use.
  // Say so plainly rather than showing an "connection failed" error that sends
  // someone debugging their network.
  const isStub = credentials.provider === 'mock';

  useEffect(() => {
    if (isStub) return;

    let client: RtcClient | null = null;
    let cancelled = false;

    const connect = async () => {
      try {
        const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
        if (cancelled) return;

        // 'live' mode: one broadcaster, many viewers — a classroom, not a
        // free-for-all conference.
        client = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' }) as unknown as RtcClient;

        client.on('user-published', async (...args: never[]) => {
          const [user, mediaType] = args as unknown as [RemoteUser, 'audio' | 'video'];
          await client!.subscribe(user, mediaType);
          if (mediaType === 'video' && remoteRef.current) {
            user.videoTrack?.play(remoteRef.current);
          }
          if (mediaType === 'audio') user.audioTrack?.play();
        });

        await client.setClientRole(role);
        await client.join(
          credentials.appId,
          credentials.channel,
          credentials.token,
          credentials.uid,
        );

        if (role === 'host') {
          const [mic, cam] = (await AgoraRTC.createMicrophoneAndCameraTracks()) as unknown as [
            LocalTrack,
            LocalTrack,
          ];
          tracksRef.current = { mic, cam };
          if (localRef.current) cam.play(localRef.current);
          await client.publish([mic, cam]);
        }

        if (!cancelled) setStatus('connected');
      } catch (error) {
        if (cancelled) return;
        setStatus('failed');
        onError?.(error instanceof Error ? error.message : String(error));
      }
    };

    void connect();

    // Tear down on unmount: an un-closed camera track keeps the webcam light on
    // long after the student has navigated away.
    return () => {
      cancelled = true;
      const { mic, cam } = tracksRef.current;
      mic?.stop();
      mic?.close();
      cam?.stop();
      cam?.close();
      tracksRef.current = {};
      client?.removeAllListeners();
      void client?.leave();
    };
  }, [credentials, role, isStub, onError]);

  const toggleMic = async () => {
    const mic = tracksRef.current.mic;
    if (!mic) return;
    await mic.setEnabled(!micOn);
    setMicOn(!micOn);
  };

  const toggleCam = async () => {
    const cam = tracksRef.current.cam;
    if (!cam) return;
    await cam.setEnabled(!camOn);
    setCamOn(!camOn);
  };

  if (isStub) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-unit-sm rounded-xl border border-dashed border-outline-variant bg-surface-container-low text-center text-on-surface-variant">
        <Icon name="videocam_off" className="text-[2.5rem]" />
        <p className="text-body-md font-semibold">{t('live.stubProvider')}</p>
        <p className="max-w-md text-body-sm">{t('live.stubProviderHint')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-unit-sm">
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-inverse-surface">
        {/* Remote video (the teacher, for a student) fills the frame. */}
        <div ref={remoteRef} className="absolute inset-0" />
        {/* The host's own camera preview sits in the corner. */}
        {role === 'host' && (
          <div
            ref={localRef}
            className="absolute bottom-3 end-3 h-1/4 w-1/4 overflow-hidden rounded-lg border border-outline-variant bg-surface"
          />
        )}
        {status !== 'connected' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-inverse-on-surface">
            <Icon
              name={status === 'failed' ? 'error' : 'progress_activity'}
              className={`text-[2.5rem] ${status === 'failed' ? 'text-error' : 'animate-spin'}`}
            />
            <p className="text-body-md">
              {status === 'failed' ? t('live.connectFailed') : t('live.connecting')}
            </p>
          </div>
        )}
      </div>

      {role === 'host' && status === 'connected' && (
        <div className="flex items-center gap-2">
          <ControlButton
            active={micOn}
            icon={micOn ? 'mic' : 'mic_off'}
            label={micOn ? t('live.muteMic') : t('live.unmuteMic')}
            onClick={toggleMic}
          />
          <ControlButton
            active={camOn}
            icon={camOn ? 'videocam' : 'videocam_off'}
            label={camOn ? t('live.stopCamera') : t('live.startCamera')}
            onClick={toggleCam}
          />
        </div>
      )}
    </div>
  );
}

function ControlButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={!active}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
        active
          ? 'bg-surface-container text-on-surface'
          : 'bg-error-container text-on-error-container'
      }`}
    >
      <Icon name={icon} className="text-[1.25rem]" />
    </button>
  );
}

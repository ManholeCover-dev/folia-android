import React from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import type { MotionValue } from 'framer-motion';
import { PlayerState } from '../../types';
import ProgressBar from '../ProgressBar';
import type { TrackNavigation } from '../FloatingPlayerControls';
import PlayerControlSlotButton from './PlayerControlSlotButton';
import type { PlayerControlSlotActionId, PlayerControlSlotContext } from './playerControlSlotActions';

// Touch playback keeps track navigation beside play, without requiring a hover gesture.
interface TouchPlayerControlsProps {
    currentSong: { name: string; } | null;
    playerState: PlayerState;
    currentTime: MotionValue<number>;
    duration: number;
    canTogglePlay: boolean;
    onSeek: (time: number) => void;
    onTogglePlay: () => void;
    noTrackText: string;
    primaryColor: string;
    secondaryColor: string;
    trackColor?: string;
    isDaylight?: boolean;
    controlsDisabled: boolean;
    trackNavigation: TrackNavigation | null;
    slotPrimary: PlayerControlSlotActionId;
    slotSecondary: PlayerControlSlotActionId;
    slotContext: PlayerControlSlotContext;
    onCollapse: () => void;
}

const TouchPlayerControls: React.FC<TouchPlayerControlsProps> = ({
    currentSong, playerState, currentTime, duration, canTogglePlay, onSeek, onTogglePlay,
    noTrackText, primaryColor, secondaryColor, trackColor, isDaylight, controlsDisabled,
    trackNavigation, slotPrimary, slotSecondary, slotContext, onCollapse,
}) => {
    const { t } = useTranslation();
    const navigationButtonClass = 'flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors active:bg-white/15 disabled:opacity-25';

    return (
        <div data-touch-player-controls className="flex w-full min-w-0 flex-col gap-2">
            <div className="relative flex h-7 items-center" style={{ color: primaryColor }}>
                <div className="w-full truncate px-11 text-center text-sm font-bold">
                    {currentSong?.name || noTrackText}
                </div>
                <button
                    type="button"
                    aria-label={t('player.collapseControls')}
                    aria-expanded
                    className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full active:bg-white/15"
                    onClick={(event) => {
                        event.stopPropagation();
                        onCollapse();
                    }}
                >
                    <ChevronDown size={20} />
                </button>
            </div>
            <div className="flex items-center justify-between gap-1" style={{ color: primaryColor }}>
                <PlayerControlSlotButton
                    actionId={slotPrimary}
                    context={slotContext}
                    primaryColor={primaryColor}
                    isDaylight={isDaylight}
                    controlsDisabled={controlsDisabled}
                    className="flex h-11 w-11 shrink-0 items-center justify-center"
                />
                <button
                    type="button"
                    aria-label={trackNavigation?.prevLabel || t('help.previousTrack')}
                    disabled={controlsDisabled || !trackNavigation?.canPrev}
                    className={navigationButtonClass}
                    onClick={(event) => {
                        event.stopPropagation();
                        trackNavigation?.onPrev();
                    }}
                >
                    <SkipBack size={24} fill="currentColor" />
                </button>
                <button
                    type="button"
                    aria-label={t('help.playPause')}
                    disabled={controlsDisabled || !canTogglePlay}
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full shadow-lg active:scale-95 disabled:opacity-40"
                    style={{ backgroundColor: primaryColor, color: 'var(--bg-color)' }}
                    onClick={(event) => {
                        event.stopPropagation();
                        onTogglePlay();
                    }}
                >
                    {playerState === PlayerState.PLAYING
                        ? <Pause size={25} fill="currentColor" />
                        : <Play size={25} fill="currentColor" className="ml-1" />}
                </button>
                <button
                    type="button"
                    aria-label={trackNavigation?.nextLabel || t('help.nextTrack')}
                    disabled={controlsDisabled || !trackNavigation?.canNext}
                    className={navigationButtonClass}
                    onClick={(event) => {
                        event.stopPropagation();
                        trackNavigation?.onNext();
                    }}
                >
                    <SkipForward size={24} fill="currentColor" />
                </button>
                <PlayerControlSlotButton
                    actionId={slotSecondary}
                    context={slotContext}
                    primaryColor={primaryColor}
                    isDaylight={isDaylight}
                    controlsDisabled={controlsDisabled}
                    className="flex h-11 w-11 shrink-0 items-center justify-center"
                />
            </div>
            <div className="px-1 py-3">
                <ProgressBar
                    currentTime={currentTime}
                    duration={duration}
                    onSeek={onSeek}
                    primaryColor={primaryColor}
                    secondaryColor={secondaryColor}
                    trackColor={trackColor}
                    disabled={controlsDisabled}
                    touchTarget
                />
            </div>
        </div>
    );
};

export default TouchPlayerControls;

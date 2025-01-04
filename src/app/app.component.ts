// app.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';

interface SilenceSegment {
  start: number;
  end: number;
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit, OnDestroy {
  videoUrl: string = '';
  videoId: string = '';
  error: string = '';
  skipSilence: boolean = false;
  silenceThreshold: number = 80;
  minSilenceDuration: number = 1.2;
  playbackSpeed: number = 1.0;
  isAnalyzing: boolean = false;
  showAdvancedControls: boolean = false;
  silenceSegments: SilenceSegment[] = [];
  currentTime: number = 0;
  duration: number = 0;
  volumeLevel: number = 0;

  private player: any;
  private silenceCheckInterval: any;
  private volumeAnalysisInterval: any;
  private audioContext: AudioContext | null = null;
  private audioAnalyser: AnalyserNode | null = null;
  private mediaStreamSource: MediaStreamAudioSourceNode | null = null;

  ngOnInit() {
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.body.appendChild(tag);

    // Initialize Audio Context
    this.initializeAudioContext();
  }

  private initializeAudioContext() {
    try {
      this.audioContext = new AudioContext();
      this.audioAnalyser = this.audioContext.createAnalyser();
      this.audioAnalyser.fftSize = 2048;
    } catch (e) {
      console.error('Web Audio API not supported:', e);
    }
  }

  loadVideo() {
    try {
      this.videoId = this.extractVideoId(this.videoUrl);
      this.error = '';
      this.currentTime = 0;
      this.duration = 0;
      this.silenceSegments = [];
      this.resetAnalysis();
    } catch (e) {
      this.error = 'Invalid YouTube URL. Please enter a valid URL.';
      this.videoId = '';
    }
  }

  onPlayerReady(event: any) {
    this.player = event.target;
    this.duration = this.player.getDuration();
    this.startVolumeAnalysis();
  }

  onPlayerStateChange(event: any) {
    // YouTube player states: -1 (unstarted), 0 (ended), 1 (playing), 2 (paused), 3 (buffering), 5 (video cued)
    if (event.data === 1) { // Playing
      this.startSilenceDetection();
    } else if (event.data === 2) { // Paused
      this.pauseAnalysis();
    }
  }

  toggleSilenceSkipping() {
    if (this.skipSilence) {
      this.startSilenceDetection();
    } else {
      this.pauseAnalysis();
    }
  }

  setPlaybackSpeed(speed: number) {
    if (this.player) {
      this.playbackSpeed = speed;
      this.player.setPlaybackRate(speed);
    }
  }

  private startVolumeAnalysis() {
    if (!this.volumeAnalysisInterval) {
      this.volumeAnalysisInterval = setInterval(() => {
        if (this.player && this.player.getPlayerState() === 1) {
          this.currentTime = this.player.getCurrentTime();
          this.analyzeVolume();
        }
      }, 100);
    }
  }

  private analyzeVolume() {
  if (!this.audioAnalyser) return;

  const dataArray = new Float32Array(this.audioAnalyser.frequencyBinCount);
  this.audioAnalyser.getFloatTimeDomainData(dataArray);

  // Simple RMS calculation
  let sum = 0;
  for (let i = 0; i < dataArray.length; i++) {
    sum += dataArray[i] * dataArray[i];
  }
  this.volumeLevel = Math.sqrt(sum / dataArray.length);
}

private startSilenceDetection() {
  if (!this.player) return;

  let silenceStart: number | null = null;

  if (!this.silenceCheckInterval) {
    this.silenceCheckInterval = setInterval(() => {
      if (this.player.getPlayerState() === 1) { // Playing
        const currentTime = this.player.getCurrentTime();
        const volume = this.volumeLevel;

        // Check if we're in silence
        if (volume < this.silenceThreshold / 100) {
          if (silenceStart === null) {
            silenceStart = currentTime;
          } else {
            const silenceDuration = currentTime - silenceStart;

            // If silence is long enough, skip it
            if (silenceDuration >= this.minSilenceDuration && this.skipSilence) {
              // Skip to current time plus minimum silence duration
              const skipTo = currentTime + this.minSilenceDuration;

              if (skipTo < this.duration) {
                this.player.seekTo(skipTo, true);
                this.silenceSegments.push({
                  start: silenceStart,
                  end: skipTo
                });
              }
              silenceStart = null;
            }
          }
        } else {
          silenceStart = null;
        }
      }
    }, 100); // Check every 100ms
  }
}



private async seekToKeyframe(targetTime: number): Promise<number> {
  // Get video duration to validate target time
  const duration = this.player.getDuration();

  // Ensure target time is within valid range
  const validTargetTime = Math.min(Math.max(0, targetTime), duration);

  // Seek to the target time
  this.player.seekTo(validTargetTime, true);

  // Wait for seek to complete and return actual time
  return new Promise((resolve) => {
    setTimeout(() => {
      const actualTime = this.player.getCurrentTime();
      resolve(actualTime);
    }, 50); // Small delay to allow seek to complete
  });
}
private isWithinExistingSilenceSegment(time: number): boolean {
  const bufferTime = 0.1; // 100ms buffer to prevent rapid seeking
  return this.silenceSegments.some(segment =>
    time >= (segment.start - bufferTime) && time <= (segment.end + bufferTime)
  );
}

  private pauseAnalysis() {
    if (this.silenceCheckInterval) {
      clearInterval(this.silenceCheckInterval);
      this.silenceCheckInterval = null;
    }
  }

  private resetAnalysis() {
    this.pauseAnalysis();
    if (this.volumeAnalysisInterval) {
      clearInterval(this.volumeAnalysisInterval);
      this.volumeAnalysisInterval = null;
    }
  }

  private extractVideoId(url: string): string {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);

    if (match && match[2].length === 11) {
      return match[2];
    }
    throw new Error('Invalid YouTube URL');
  }

  formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  getTotalSilenceTime(): number {
    return this.silenceSegments.reduce((total, segment) =>
      total + (segment.end - segment.start), 0);
  }

  ngOnDestroy() {
    this.resetAnalysis();
    if (this.audioContext) {
      this.audioContext.close();
    }
  }
}


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
  silenceThreshold: number = 50;
  minSilenceDuration: number = 0.5;
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

    // Calculate RMS volume
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i] * dataArray[i];
    }
    this.volumeLevel = Math.sqrt(sum / dataArray.length);
  }

  private startSilenceDetection() {
    if (!this.player) return;

    if (!this.silenceCheckInterval) {
      this.silenceCheckInterval = setInterval(() => {
        if (this.player.getPlayerState() === 1) {
          const currentTime = this.player.getCurrentTime();
          const volume = this.volumeLevel;

          if (volume < this.silenceThreshold / 100) {
            const silenceSegment = {
              start: currentTime,
              end: currentTime + this.minSilenceDuration
            };

            // Check if we should skip this segment
            if (this.skipSilence &&
                silenceSegment.end < this.duration &&
                !this.isWithinExistingSilenceSegment(currentTime)) {
              this.player.seekTo(silenceSegment.end, true);
              this.silenceSegments.push(silenceSegment);
            }
          }
        }
      }, 100);
    }
  }

  private isWithinExistingSilenceSegment(time: number): boolean {
    return this.silenceSegments.some(segment =>
      time >= segment.start && time <= segment.end
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


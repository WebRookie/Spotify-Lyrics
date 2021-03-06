import { Event } from '../consts';

import generateSVG from './svg';
import songObserver, { Query } from './song';
import { setSongId } from './store';
import { video, audio } from './element';
import { lyric, updateLyric, Lyric, sendMatchedData } from './lyrics';

import './pip';
import './misc';

songObserver(updateLyric);

declare global {
  interface HTMLCanvasElement {
    captureStream: (frameRate?: number) => MediaStream;
  }
  interface CanvasCaptureMediaStream extends MediaStream {
    canvas: HTMLCanvasElement;
  }
  interface CanvasCaptureMediaStreamTrack extends MediaStreamTrack {
    canvas: HTMLCanvasElement;
  }
}

const WIDTH = 640;
const HEIGHT = 640;
const INTERVAL = 80;

const weakMap = new WeakMap<MediaStream, CanvasCaptureMediaStreamTrack>();
const lyricWeakMap = new WeakMap<CanvasCaptureMediaStreamTrack, Lyric>();
const prevTimeWeakMap = new WeakMap<CanvasCaptureMediaStreamTrack, number>();
let errorLyric: Lyric;
const lyricCanvas = document.createElement('canvas');
const ctx = lyricCanvas.getContext('2d');
// Firefox Issue: NS_ERROR_NOT_INITIALIZED
// https://bugzilla.mozilla.org/show_bug.cgi?id=1572422
const lyricTrack = lyricCanvas.captureStream().getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
lyricCanvas.width = WIDTH;
lyricCanvas.height = HEIGHT;
if (ctx) {
  const update = () => {
    if (!video || !audio || !(video.srcObject instanceof MediaStream) || !document.pictureInPictureElement) {
      return setTimeout(update, INTERVAL);
    }
    if (!weakMap.get(video.srcObject)) {
      // song change
      // change coverTrack
      const coverTrack = video.srcObject.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
      if (!coverTrack.canvas) {
        // Firefox Issue: https://bugzilla.mozilla.org/show_bug.cgi?id=1231131
        coverTrack.canvas = (video.srcObject as CanvasCaptureMediaStream).canvas;
      }
      const stream = new MediaStream([lyricTrack]);
      video.srcObject = stream;
      weakMap.set(video.srcObject, coverTrack);
      if (video.paused) {
        video.play();
      }
    }
    const coverTrack = weakMap.get(video.srcObject) as CanvasCaptureMediaStreamTrack;
    const prevTime = prevTimeWeakMap.get(coverTrack) || 0;
    const currentLyric = lyricWeakMap.get(coverTrack) || lyric;
    const url = `data:image/svg+xml,${encodeURIComponent(
      generateSVG(currentLyric, audio.currentTime > prevTime ? audio.currentTime : prevTime),
    )}`;
    prevTimeWeakMap.set(coverTrack, audio.currentTime);
    const img = new Image(WIDTH, HEIGHT);
    img.onload = () => {
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      ctx.drawImage(coverTrack.canvas, 0, 0, WIDTH, HEIGHT);
      if (lyric.length > 0) {
        lyricWeakMap.set(coverTrack, lyric);
        ctx.drawImage(img, 0, 0, WIDTH, HEIGHT);
      }
      setTimeout(update, INTERVAL);
    };
    img.onerror = () => {
      if (errorLyric !== currentLyric) {
        console.error('error lyric:', currentLyric);
        errorLyric = currentLyric;
      }
      ctx.drawImage(coverTrack.canvas, 0, 0, WIDTH, HEIGHT);
      setTimeout(update, INTERVAL);
    };
    img.src = url;
  };
  update();
} else {
  throw new Error('lyric canvas context fail');
}

window.addEventListener('message', async ({ data }: MessageEvent) => {
  if (data?.type === Event.GET_SONGS) {
    sendMatchedData();
  }
  if (data?.type === Event.SELECT_SONG && video && video.srcObject) {
    const info = data.data as Query & { id: number };
    const { id, name, artists } = info;
    await setSongId(info);
    const coverTrack = weakMap.get(video.srcObject as CanvasCaptureMediaStream);
    lyricWeakMap.delete(coverTrack as CanvasCaptureMediaStreamTrack);
    if (id) {
      updateLyric(id as number);
    } else {
      updateLyric({ name, artists });
    }
  }
});

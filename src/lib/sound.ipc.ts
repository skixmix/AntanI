import { invoke } from "@tauri-apps/api/core";

/** macOS's built-in alert sounds, from `/System/Library/Sounds`. */
export const SYSTEM_SOUNDS = [
  "Basso",
  "Blow",
  "Bottle",
  "Frog",
  "Funk",
  "Glass",
  "Hero",
  "Morse",
  "Ping",
  "Pop",
  "Purr",
  "Sosumi",
  "Submarine",
  "Tink",
] as const;

export function playSystemSound(name: string): Promise<void> {
  return invoke("play_system_sound", { name });
}
